<?php

declare(strict_types=1);

namespace Foundu\Search;

use Foundu\Auth\Actor;
use Foundu\Data\Items as ItemRows;
use Foundu\Data\Settings;
use Foundu\Database;
use Foundu\Http\HttpError;
use PDO;

// School-sized tables are scored in PHP. A count at or under CAP loads the
// text columns and ranks them, which matches pg_trgm because nothing is
// dropped before the score. Past CAP, a few character bigrams (LIKE, which
// can use no index for a leading wildcard) pick at most CAP rows. That is
// the shared-host choice: no extra n-gram table to maintain on every write,
// and no FULLTEXT parser that cannot see inside a Thai word.
final class Items
{
    public const CAP = 300;

    public static function probes(string $query): array
    {
        $chars = preg_split('//u', trim($query), -1, PREG_SPLIT_NO_EMPTY);
        if ($chars === false || $chars === []) {
            return [];
        }
        if (count($chars) === 1) {
            return [$chars[0]];
        }
        $probes = [];
        $span = count($chars) - 1;
        $step = max(1, intdiv($span, 4));
        for ($i = 0; $i < $span && count($probes) < 4; $i += $step) {
            $probes[$chars[$i] . $chars[$i + 1]] = true;
        }
        return array_keys($probes);
    }

    public static function search(PDO $pdo, array $config, array $query): array
    {
        $text = self::normalize((string) ($query['q'] ?? $query['query'] ?? ''));
        if (mb_strlen($text, 'UTF-8') > 80) {
            throw new HttpError(400, 'invalid_input', ['field' => 'q']);
        }
        $type = (string) ($query['type'] ?? 'all');
        if (!in_array($type, ['lost', 'found', 'all'], true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'type']);
        }
        $mode = (string) ($query['mode'] ?? 'catalog');
        if (!in_array($mode, ['catalog', 'agent'], true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'mode']);
        }
        $limit = self::limit($query['limit'] ?? null);
        $settings = Settings::read($pdo);
        $threshold = self::threshold($query, $config, $settings, $mode);
        $category = self::optionalText($query['category'] ?? null, 'category', 64);
        $status = self::optionalStatus($query['status'] ?? null);

        $lost = [];
        $found = [];
        if ($type !== 'found') {
            $lost = self::side($pdo, 'lost', $text, $threshold, $limit, $category, $status);
        }
        if ($type !== 'lost') {
            $found = self::side($pdo, 'found', $text, $threshold, $limit, $category, $status);
        }
        return Relevance::filter($lost, $found, $text, $mode);
    }

    // Guests and other students do not get phone, Line, or the rest of the
    // contact list. The owner and an admin still do. List routes are unchanged.
    public static function redact(array $body, Actor $actor): array
    {
        foreach (['lost' => 'contacts', 'found' => 'finderContacts'] as $side => $field) {
            if (!isset($body[$side]) || !is_array($body[$side])) {
                continue;
            }
            foreach ($body[$side] as $index => $item) {
                if (!is_array($item) || self::seesContacts($actor, $item)) {
                    continue;
                }
                $item[$field] = [];
                $body[$side][$index] = $item;
            }
        }
        return $body;
    }

    private static function seesContacts(Actor $actor, array $item): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        $owner = $item['userId'] ?? null;
        return is_string($actor->accountId) && $actor->accountId !== '' && $owner === $actor->accountId;
    }

    private static function side(
        PDO $pdo,
        string $kind,
        string $text,
        float $threshold,
        int $limit,
        ?string $category,
        ?string $status,
    ): array {
        $location = $kind === 'found' ? 'location_found' : 'location_lost';
        $table = $kind === 'found' ? 'found_items' : 'lost_items';
        [$where, $params] = self::filters($category, $status);
        if ($text === '') {
            $sql = 'SELECT * FROM ' . $table . $where . ' ORDER BY created_at DESC, id ASC LIMIT ' . $limit;
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            return self::map($rows, $kind);
        }
        if (preg_match('/^(?:LOST|FOUND)-/i', $text) === 1) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'tracking_code LIKE ? ESCAPE \'!\'';
            $params[] = self::like(mb_strtoupper($text, 'UTF-8'), true);
            $sql = 'SELECT * FROM ' . $table . $where . ' ORDER BY created_at DESC, id ASC LIMIT 50';
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            $ranked = [];
            foreach ($rows as $row) {
                $ranked[] = self::rankRow($row, $location);
            }
            $ids = Rank::top($ranked, $text, $threshold, $limit);
            return self::map(self::order($rows, $ids), $kind);
        }

        $countSql = 'SELECT COUNT(*) FROM ' . $table . $where;
        $count = (int) Database::run($pdo, $countSql, $params)->fetchColumn();
        $scanAll = $count <= self::CAP;
        $likeParams = $params;
        $likeWhere = $where;
        if (!$scanAll) {
            $ors = [];
            foreach (self::probes($text) as $probe) {
                $pattern = self::like($probe, false);
                foreach (['item_name', 'description', $location, 'tracking_code'] as $column) {
                    $ors[] = $column . ' LIKE ? ESCAPE \'!\'';
                    $likeParams[] = $pattern;
                }
            }
            if ($ors !== []) {
                $likeWhere .= ($likeWhere === '' ? ' WHERE ' : ' AND ') . '(' . implode(' OR ', $ors) . ')';
            }
        }
        $sql = 'SELECT id, item_name, description, ' . $location . ' AS location, tracking_code, created_at FROM '
            . $table . $likeWhere . ' ORDER BY created_at DESC, id ASC LIMIT ' . self::CAP;
        $candidates = Database::run($pdo, $sql, $likeParams)->fetchAll();
        $ids = Rank::top($candidates, $text, $threshold, $limit);
        if ($ids === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $full = Database::run($pdo, 'SELECT * FROM ' . $table . ' WHERE id IN (' . $marks . ')', $ids)->fetchAll();
        return self::map(self::order($full, $ids), $kind);
    }

    private static function rankRow(array $row, string $location): array
    {
        return [
            'id' => (string) $row['id'],
            'item_name' => (string) ($row['item_name'] ?? ''),
            'description' => (string) ($row['description'] ?? ''),
            'location' => (string) ($row[$location] ?? $row['location'] ?? ''),
            'tracking_code' => (string) ($row['tracking_code'] ?? ''),
            'created_at' => (string) ($row['created_at'] ?? ''),
        ];
    }

    private static function order(array $rows, array $ids): array
    {
        $byId = [];
        foreach ($rows as $row) {
            $byId[(string) $row['id']] = $row;
        }
        $ordered = [];
        foreach ($ids as $id) {
            if (isset($byId[$id])) {
                $ordered[] = $byId[$id];
            }
        }
        return $ordered;
    }

    private static function map(array $rows, string $kind): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[] = $kind === 'found' ? ItemRows::found($row) : ItemRows::lost($row);
        }
        return $out;
    }

    private static function filters(?string $category, ?string $status): array
    {
        $where = [];
        $params = [];
        if ($category !== null) {
            $where[] = 'category = ?';
            $params[] = $category;
        }
        if ($status !== null) {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        $sql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        return [$sql, $params];
    }

    private static function like(string $value, bool $prefix): string
    {
        $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
        return $prefix ? $escaped . '%' : '%' . $escaped . '%';
    }

    public static function normalize(string $value): string
    {
        $value = str_replace(',', ' ', $value);
        $value = trim($value);
        $collapsed = preg_replace('/\s+/u', ' ', $value);
        return is_string($collapsed) ? $collapsed : $value;
    }

    private static function limit(mixed $value): int
    {
        if ($value === null || $value === '') {
            return 10;
        }
        if (is_string($value) && preg_match('/^\d+$/', $value) === 1) {
            $value = (int) $value;
        }
        if (!is_int($value) || $value < 1 || $value > 10) {
            throw new HttpError(400, 'invalid_input', ['field' => 'limit']);
        }
        return $value;
    }

    private static function threshold(array $query, array $config, array $settings, string $mode): float
    {
        if (isset($query['threshold']) && $query['threshold'] !== '' && is_numeric($query['threshold'])) {
            $value = (float) $query['threshold'];
        } elseif ($mode === 'agent') {
            $raw = $config['AGENT_SEARCH_SIMILARITY_THRESHOLD'] ?? 0.3;
            $value = is_numeric($raw) ? (float) $raw : 0.3;
        } else {
            $raw = $settings['searchSimilarityThreshold'] ?? ($config['SEARCH_SIMILARITY_THRESHOLD'] ?? 0.15);
            $value = is_numeric($raw) ? (float) $raw : 0.15;
        }
        if ($value < 0 || $value > 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'threshold']);
        }
        return $value;
    }

    private static function optionalText(mixed $value, string $field, int $max): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value)) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $text = trim($value);
        if ($text === '' || mb_strlen($text, 'UTF-8') > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $text;
    }

    private static function optionalStatus(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !in_array($value, ['searching', 'pending_room_confirm', 'found', 'claimed', 'expired'], true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'status']);
        }
        return $value;
    }
}
