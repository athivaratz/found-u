<?php

declare(strict_types=1);

namespace Foundu\Search;

// Agent queries often say "หูฟังแถวโรงอาหาร". Catalog search keeps the
// trigram order. Agent search drops rows whose location text misses the
// part after the marker. Same markers as lib/search/relevance.ts.
final class Relevance
{
    private const MARKERS = ['แถว', 'บริเวณ', 'ใกล้', 'ข้าง', 'หลัง', 'หน้า', 'ใน', 'ชั้น', 'ที่หาย', 'ที่เจอ'];

    public static function filter(array $lost, array $found, string $query, string $mode): array
    {
        if ($mode !== 'agent') {
            return ['lost' => $lost, 'found' => $found, 'filteredCount' => 0];
        }
        $terms = self::locationTerms($query);
        if ($terms === null) {
            return ['lost' => $lost, 'found' => $found, 'filteredCount' => 0];
        }
        $before = count($lost) + count($found);
        $lost = array_values(array_filter($lost, static function (array $item) use ($terms): bool {
            $loc = trim(((string) ($item['locationLost'] ?? '')) . ' ' . ((string) ($item['locationPlaceName'] ?? '')));
            return self::locationMatches($loc, $terms);
        }));
        $found = array_values(array_filter($found, static function (array $item) use ($terms): bool {
            $loc = trim(((string) ($item['locationFound'] ?? '')) . ' ' . ((string) ($item['locationPlaceName'] ?? '')));
            return self::locationMatches($loc, $terms);
        }));
        return [
            'lost' => $lost,
            'found' => $found,
            'filteredCount' => max(0, $before - count($lost) - count($found)),
        ];
    }

    public static function locationTerms(string $query): ?string
    {
        $raw = trim($query);
        if ($raw === '') {
            return null;
        }
        foreach (self::MARKERS as $marker) {
            $idx = mb_strpos($raw, $marker, 0, 'UTF-8');
            if ($idx === false) {
                continue;
            }
            $location = trim(mb_substr($raw, $idx + mb_strlen($marker, 'UTF-8'), null, 'UTF-8'));
            if (mb_strlen($location, 'UTF-8') >= 2) {
                return $location;
            }
        }
        return null;
    }

    public static function locationMatches(string $location, string $terms): bool
    {
        $loc = mb_strtolower(trim($location), 'UTF-8');
        $want = mb_strtolower(trim($terms), 'UTF-8');
        if ($loc === '' || $want === '') {
            return false;
        }
        if (str_contains($loc, $want) || str_contains($want, $loc)) {
            return true;
        }
        foreach (preg_split('/\s+/u', $want) ?: [] as $token) {
            if (mb_strlen($token, 'UTF-8') >= 2 && str_contains($loc, $token)) {
                return true;
            }
        }
        return false;
    }
}
