<?php

declare(strict_types=1);

namespace Foundu\Match;

use Foundu\Data\Feed;
use Foundu\Data\Items as ItemRows;
use Foundu\Database;
use Foundu\Http\HttpError;
use Foundu\Ids;
use PDO;
use PDOException;
use Throwable;

final class Store
{
    private const LOST = 'id, tracking_code, item_name, category, description, location_lost, location_place_name, location_coords, date_lost, contacts, user_id, student_id, status, matched_found_id, created_at, updated_at';
    private const FOUND = 'id, tracking_code, photo_url, item_name, category, color, brand, description, location_found, location_place_name, location_coords, date_found, drop_off_location, finder_contacts, user_id, status, room_handover_confirmed, room_handover_confirmed_at, room_handover_confirmed_by, room_handover_confirmed_by_name, handover_deadline_at, expired_at, matched_lost_id, created_at, updated_at';

    public static function lost(PDO $pdo, string $id): ?array
    {
        $row = Database::run($pdo, 'SELECT ' . self::LOST . ' FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
        return is_array($row) ? ItemRows::lost($row) : null;
    }

    public static function found(PDO $pdo, string $id): ?array
    {
        $row = Database::run($pdo, 'SELECT ' . self::FOUND . ' FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
        return is_array($row) ? ItemRows::found($row) : null;
    }

    public static function matchableFound(PDO $pdo, ?string $aroundIso): array
    {
        return self::matchable($pdo, 'found', $aroundIso);
    }

    public static function matchableLost(PDO $pdo, ?string $aroundIso): array
    {
        return self::matchable($pdo, 'lost', $aroundIso);
    }

    public static function dismissed(PDO $pdo): array
    {
        $rows = Database::run($pdo, 'SELECT lost_id, found_id FROM match_dismissals', [])->fetchAll();
        $keys = [];
        foreach ($rows as $row) {
            $keys[$row['lost_id'] . '_' . $row['found_id']] = true;
        }
        return $keys;
    }

    public static function history(PDO $pdo, int $limit = 50): array
    {
        $limit = max(1, min(50, $limit));
        $lostRows = Database::run(
            $pdo,
            'SELECT ' . self::LOST . ' FROM lost_items WHERE matched_found_id IS NOT NULL ORDER BY updated_at DESC, id ASC LIMIT ' . $limit,
            []
        )->fetchAll();
        if ($lostRows === []) {
            return [];
        }
        $foundIds = [];
        foreach ($lostRows as $row) {
            if ($row['matched_found_id'] !== null) {
                $foundIds[] = (string) $row['matched_found_id'];
            }
        }
        $foundById = [];
        if ($foundIds !== []) {
            $marks = implode(',', array_fill(0, count($foundIds), '?'));
            $foundRows = Database::run($pdo, 'SELECT ' . self::FOUND . ' FROM found_items WHERE id IN (' . $marks . ')', $foundIds)->fetchAll();
            foreach ($foundRows as $row) {
                $foundById[(string) $row['id']] = ItemRows::found($row);
            }
        }
        $pairs = [];
        foreach ($lostRows as $row) {
            $lost = ItemRows::lost($row);
            $foundId = (string) ($lost['matchedFoundId'] ?? '');
            if ($foundId === '' || !isset($foundById[$foundId])) {
                continue;
            }
            $pairs[] = [
                'key' => $lost['id'] . '_' . $foundId,
                'lostItem' => $lost,
                'foundItem' => $foundById[$foundId],
                'matchedAt' => $lost['updatedAt'],
            ];
        }
        return $pairs;
    }

    public static function confirm(PDO $pdo, string $lostId, string $foundId): void
    {
        self::link($pdo, $lostId, $foundId, true);
    }

    public static function unmatch(PDO $pdo, string $lostId, string $foundId): void
    {
        self::link($pdo, $lostId, $foundId, false);
    }

    public static function reject(PDO $pdo, string $lostId, string $foundId, ?string $by): void
    {
        if (self::lost($pdo, $lostId) === null || self::found($pdo, $foundId) === null) {
            throw new HttpError(404, 'Item not found');
        }
        $pdo->beginTransaction();
        try {
            Database::run(
                $pdo,
                'INSERT INTO match_dismissals (id, lost_id, found_id, dismissed_by, created_at)
                 VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
                 ON DUPLICATE KEY UPDATE dismissed_by = ?, updated_at = UTC_TIMESTAMP(3)',
                [Ids::uuid(), $lostId, $foundId, $by, $by]
            );
            Feed::bump($pdo, 'match_dismissals');
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof HttpError) {
                throw $e;
            }
            if ($e instanceof PDOException && (string) ($e->errorInfo[0] ?? '') === '23000') {
                throw new HttpError(409, 'conflict');
            }
            throw new HttpError(500, 'server_error');
        }
    }

    private static function link(PDO $pdo, string $lostId, string $foundId, bool $confirm): void
    {
        $pdo->beginTransaction();
        try {
            $lost = Database::run(
                $pdo,
                'SELECT id, status, matched_found_id FROM lost_items WHERE id = ? FOR UPDATE',
                [$lostId]
            )->fetch();
            if (!is_array($lost)) {
                throw new HttpError(409, 'lost_not_found');
            }
            $found = Database::run(
                $pdo,
                'SELECT id, status, matched_lost_id FROM found_items WHERE id = ? FOR UPDATE',
                [$foundId]
            )->fetch();
            if (!is_array($found)) {
                throw new HttpError(409, 'found_not_found');
            }
            if ($confirm) {
                if ($lost['status'] !== 'searching' || $lost['matched_found_id'] !== null) {
                    throw new HttpError(409, 'lost_not_matchable');
                }
                if (!in_array((string) $found['status'], ['pending_room_confirm', 'found'], true) || $found['matched_lost_id'] !== null) {
                    throw new HttpError(409, 'found_not_matchable');
                }
                Database::run(
                    $pdo,
                    'UPDATE lost_items SET matched_found_id = ?, status = \'found\' WHERE id = ?',
                    [$foundId, $lostId]
                );
                Database::run(
                    $pdo,
                    'UPDATE found_items SET matched_lost_id = ?, status = \'found\' WHERE id = ?',
                    [$lostId, $foundId]
                );
            } else {
                if ((string) ($lost['matched_found_id'] ?? '') !== $foundId || (string) ($found['matched_lost_id'] ?? '') !== $lostId) {
                    throw new HttpError(409, 'not_linked');
                }
                Database::run(
                    $pdo,
                    'UPDATE lost_items SET matched_found_id = NULL, status = \'searching\' WHERE id = ?',
                    [$lostId]
                );
                Database::run(
                    $pdo,
                    'UPDATE found_items SET matched_lost_id = NULL, status = \'found\' WHERE id = ?',
                    [$foundId]
                );
            }
            Feed::bump($pdo, 'lost_items');
            Feed::bump($pdo, 'found_items');
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof HttpError) {
                throw $e;
            }
            throw new HttpError(500, 'server_error');
        }
    }

    private static function matchable(PDO $pdo, string $kind, ?string $aroundIso): array
    {
        if ($kind === 'found') {
            $sql = 'SELECT ' . self::FOUND . ' FROM found_items WHERE status IN (\'pending_room_confirm\', \'found\') AND matched_lost_id IS NULL';
            $dateColumn = 'date_found';
        } else {
            $sql = 'SELECT ' . self::LOST . ' FROM lost_items WHERE status = \'searching\' AND matched_found_id IS NULL';
            $dateColumn = 'date_lost';
        }
        $params = [];
        if (is_string($aroundIso) && $aroundIso !== '') {
            $unix = strtotime($aroundIso);
            if ($unix !== false) {
                $delta = Engine::TIME_WINDOW_DAYS * 86400;
                $sql .= ' AND ' . $dateColumn . ' >= ? AND ' . $dateColumn . ' <= ?';
                $params[] = gmdate('Y-m-d H:i:s', $unix - $delta) . '.000';
                $params[] = gmdate('Y-m-d H:i:s', $unix + $delta) . '.000';
            }
        }
        $sql .= ' ORDER BY created_at DESC, id ASC LIMIT 500';
        $rows = Database::run($pdo, $sql, $params)->fetchAll();
        $items = [];
        foreach ($rows as $row) {
            $items[] = $kind === 'found' ? ItemRows::found($row) : ItemRows::lost($row);
        }
        return $items;
    }
}
