<?php

declare(strict_types=1);

namespace Foundu\Search;

// Same order as search_lost_items_fuzzy / search_found_items_fuzzy:
// a LOST- or FOUND- query is a tracking-code prefix only; anything else
// keeps a row when the best of name, description, and location reaches
// the threshold, or when the tracking code contains the query. Score is
// that best similarity. Tracking text is not part of the score.
final class Rank
{
    public static function top(array $rows, string $query, float $threshold, int $limit): array
    {
        $needle = trim($query);
        $limit = max(1, min(50, $limit));
        $prefixMode = $needle !== '' && preg_match('/^(?:LOST|FOUND)-/i', $needle) === 1;
        $upper = mb_strtoupper($needle, 'UTF-8');
        $scored = [];
        foreach ($rows as $row) {
            if (!is_array($row) || !isset($row['id'])) {
                continue;
            }
            $name = (string) ($row['item_name'] ?? '');
            $desc = (string) ($row['description'] ?? '');
            $loc = (string) ($row['location'] ?? '');
            $code = (string) ($row['tracking_code'] ?? '');
            $score = max(
                Trigram::similarity($name, $needle),
                Trigram::similarity($desc, $needle),
                Trigram::similarity($loc, $needle)
            );
            $codeUpper = mb_strtoupper($code, 'UTF-8');
            $codePrefix = $needle !== '' && str_starts_with($codeUpper, $upper);
            $codeHit = $needle !== '' && mb_stripos($code, $needle, 0, 'UTF-8') !== false;
            if ($prefixMode) {
                if (!$codePrefix) {
                    continue;
                }
                $group = 0;
            } elseif ($needle !== '' && $score < $threshold && !$codeHit) {
                continue;
            } else {
                $group = 1;
            }
            $scored[] = [
                'id' => (string) $row['id'],
                'group' => $group,
                'score' => $score,
                'created_at' => (string) ($row['created_at'] ?? ''),
            ];
        }
        usort($scored, static function (array $a, array $b): int {
            if ($a['group'] !== $b['group']) {
                return $a['group'] <=> $b['group'];
            }
            $delta = $a['score'] - $b['score'];
            if (abs($delta) > 1e-9) {
                return $delta < 0 ? 1 : -1;
            }
            if ($a['created_at'] !== $b['created_at']) {
                return strcmp($b['created_at'], $a['created_at']);
            }
            return strcmp($a['id'], $b['id']);
        });
        $ids = [];
        foreach (array_slice($scored, 0, $limit) as $row) {
            $ids[] = $row['id'];
        }
        return $ids;
    }
}
