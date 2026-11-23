<?php

declare(strict_types=1);

namespace Foundu\Match;

// Port of lib/matching.ts. Weights, thresholds, keyword tables, and the
// reason strings stay as they are so a pair the old page showed still
// shows here. AI re-rank only looks at the top traditional pairs.
final class Engine
{
    public const THRESHOLD = 0.40;
    public const HIGH = 0.70;
    public const MEDIUM = 0.55;
    public const TIME_WINDOW_DAYS = 30;
    public const AI_CANDIDATES = 3;

    private const WEIGHTS = [
        'category' => 0.20,
        'item' => 0.35,
        'location' => 0.20,
        'description' => 0.15,
        'time' => 0.10,
    ];

    private const LOCATIONS = [
        'โรงอาหาร' => ['โรงอาหาร', 'canteen', 'ทานข้าว', 'อาหาร', 'โต๊ะอาหาร', 'ศูนย์อาหาร'],
        'สนามกีฬา' => ['สนามกีฬา', 'โกล', 'สนามบอล', 'สนามฟุตบอล', 'กีฬา', 'court', 'สนาม', 'ฟุตซอล', 'บาส', 'วอลเล่ย์'],
        'ห้องน้ำ' => ['ห้องน้ำ', 'toilet', 'ส้วม', 'bathroom', 'restroom'],
        'ห้องสมุด' => ['ห้องสมุด', 'library', 'ศูนย์เรียนรู้'],
        'ตึก' => ['ตึก', 'อาคาร', 'building', 'ชั้น', 'floor'],
        'ห้องเรียน' => ['ห้องเรียน', 'ห้อง', 'classroom', 'class'],
        'สหกรณ์' => ['สหกรณ์', 'ร้าน', 'shop', 'ร้านค้า', 'เซเว่น', '7-11'],
        'ธุรการ' => ['ธุรการ', 'admin', 'office', 'สำนักงาน'],
        'ปกครอง' => ['ปกครอง', 'discipline', 'กิจการ'],
        'หอพัก' => ['หอพัก', 'หอ', 'dorm', 'dormitory', 'ที่พัก'],
        'ลานจอดรถ' => ['ลานจอดรถ', 'จอดรถ', 'parking', 'ที่จอด'],
        'โถง' => ['โถง', 'lobby', 'ทางเดิน', 'บันได', 'ลิฟต์'],
    ];

    private const CATEGORIES = [
        'wallet' => ['กระเป๋าสตางค์', 'wallet', 'เงิน', 'บัตร', 'กระเป๋าตัง', 'สตางค์', 'ตังค์'],
        'phone' => ['โทรศัพท์', 'มือถือ', 'phone', 'iphone', 'samsung', 'android', 'oppo', 'vivo', 'xiaomi', 'realme', 'huawei', 'โทรศัพ'],
        'keys' => ['กุญแจ', 'key', 'พวงกุญแจ', 'ลูกกุญแจ', 'รีโมท', 'remote', 'กุญแจรถ', 'กุญแจบ้าน'],
        'bag' => ['กระเป๋า', 'bag', 'เป้', 'backpack', 'กระเป๋าเป้', 'กระเป๋าสะพาย', 'ถุง', 'pouch'],
        'electronics' => ['ไอแพด', 'ipad', 'laptop', 'แท็บเล็ต', 'tablet', 'หูฟัง', 'airpods', 'earbuds', 'powerbank', 'แบตสำรอง', 'charger', 'สายชาร์จ', 'เมาส์', 'mouse', 'คีย์บอร์ด', 'keyboard', 'flash drive', 'usb', 'หม้อ', 'พัดลม', 'กล้อง', 'camera'],
        'documents' => ['เอกสาร', 'บัตร', 'card', 'สมุด', 'หนังสือ', 'ใบ', 'บัตรนักเรียน', 'บัตรประชาชน', 'id card', 'passport', 'ใบขับขี่'],
        'clothing' => ['เสื้อ', 'กางเกง', 'หมวก', 'รองเท้า', 'jacket', 'แจ็คเก็ต', 'เสื้อกันหนาว', 'ผ้าพันคอ', 'ถุงเท้า', 'เข็มขัด', 'ร่ม', 'umbrella'],
        'accessories' => ['แหวน', 'สร้อย', 'ต่างหู', 'นาฬิกา', 'แว่น', 'watch', 'glasses', 'สร้อยคอ', 'กำไล', 'เครื่องประดับ', 'jewelry', 'แว่นตา', 'smartwatch', 'apple watch'],
        'other' => [],
    ];

    private const BRANDS = ['iphone', 'samsung', 'oppo', 'vivo', 'casio', 'seiko', 'nike', 'adidas', 'converse', 'apple', 'xiaomi'];
    private const COLORS = ['ดำ', 'ขาว', 'แดง', 'น้ำเงิน', 'เขียว', 'เหลือง', 'ชมพู', 'ม่วง', 'ส้ม', 'น้ำตาล', 'เทา', 'ทอง', 'เงิน'];

    public static function detectCategory(string $text): ?string
    {
        $lower = mb_strtolower($text, 'UTF-8');
        foreach (self::CATEGORIES as $category => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($lower, mb_strtolower($keyword, 'UTF-8'))) {
                    return $category;
                }
            }
        }
        return null;
    }

    public static function forLost(array $lost, array $foundItems, array $zones = []): array
    {
        if (!self::matchableLost($lost)) {
            return [];
        }
        $candidates = array_values(array_filter($foundItems, [self::class, 'matchableFound']));
        $category = (string) ($lost['category'] ?? '');
        if ($category !== '' && $category !== 'other') {
            $narrow = array_values(array_filter($candidates, static function (array $found) use ($category): bool {
                $foundCategory = self::foundCategory($found);
                return $foundCategory === null || $foundCategory === $category;
            }));
            if ($narrow !== []) {
                $candidates = $narrow;
            }
        }
        $anchor = self::unix($lost['dateLost'] ?? null);
        $candidates = self::within($candidates, $anchor, 'dateFound');
        return self::scoreList($lost, $candidates, $zones, true);
    }

    public static function forFound(array $found, array $lostItems, array $zones = []): array
    {
        if (!self::matchableFound($found)) {
            return [];
        }
        $candidates = array_values(array_filter($lostItems, [self::class, 'matchableLost']));
        $foundCategory = self::foundCategory($found);
        if ($foundCategory !== null && $foundCategory !== 'other') {
            $narrow = array_values(array_filter($candidates, static function (array $lost) use ($foundCategory): bool {
                $category = (string) ($lost['category'] ?? '');
                return $category === '' || $category === 'other' || $category === $foundCategory;
            }));
            if ($narrow !== []) {
                $candidates = $narrow;
            }
        }
        $anchor = self::unix($found['dateFound'] ?? null);
        $candidates = self::within($candidates, $anchor, 'dateLost');
        return self::scoreList($found, $candidates, $zones, false);
    }

    public static function confidence(float $score): string
    {
        if ($score >= self::HIGH) {
            return 'high';
        }
        if ($score >= self::MEDIUM) {
            return 'medium';
        }
        return 'low';
    }

    public static function format(array $match): array
    {
        $score = (float) $match['score'];
        return [
            'key' => $match['lostItem']['id'] . '_' . $match['foundItem']['id'],
            'score' => $score,
            'scorePercentage' => (int) round($score * 100),
            'confidence' => self::confidence($score),
            'reasons' => array_values($match['reasons']),
            'lostItem' => $match['lostItem'],
            'foundItem' => $match['foundItem'],
        ];
    }

    public static function applyAi(array $match, array $ai): ?array
    {
        if (($ai['isMatch'] ?? false) !== true) {
            return null;
        }
        $score = min(1.0, max(0.0, (float) ($ai['score'] ?? 0)));
        $reasons = $ai['reasons'] ?? [];
        if (!is_array($reasons) || $reasons === []) {
            $reasons = $match['reasons'];
        }
        $clean = [];
        foreach ($reasons as $reason) {
            if (is_string($reason) && $reason !== '') {
                $clean[] = $reason;
            }
        }
        return [
            'lostItem' => $match['lostItem'],
            'foundItem' => $match['foundItem'],
            'score' => $score,
            'reasons' => $clean !== [] ? $clean : $match['reasons'],
        ];
    }

    public static function matchableLost(array $item): bool
    {
        return ($item['status'] ?? '') === 'searching' && empty($item['matchedFoundId']);
    }

    public static function matchableFound(array $item): bool
    {
        return in_array((string) ($item['status'] ?? ''), ['pending_room_confirm', 'found'], true)
            && empty($item['matchedLostId']);
    }

    private static function scoreList(array $anchor, array $candidates, array $zones, bool $anchorIsLost): array
    {
        $matches = [];
        foreach ($candidates as $other) {
            $lost = $anchorIsLost ? $anchor : $other;
            $found = $anchorIsLost ? $other : $anchor;
            $scored = self::score($lost, $found, $zones);
            if ($scored['score'] >= self::THRESHOLD && $scored['reasons'] !== []) {
                $matches[] = $scored;
            }
        }
        usort($matches, static function (array $a, array $b): int {
            $delta = $a['score'] - $b['score'];
            if (abs($delta) > 1e-9) {
                return $delta < 0 ? 1 : -1;
            }
            return strcmp((string) $a['foundItem']['id'], (string) $b['foundItem']['id']);
        });
        return $matches;
    }

    public static function score(array $lost, array $found, array $zones = []): array
    {
        $reasons = [];
        $total = 0.0;

        $foundCategory = self::foundCategory($found);
        $lostCategory = (string) ($lost['category'] ?? '');
        if ($lostCategory !== '' && $foundCategory !== null) {
            if ($lostCategory === $foundCategory) {
                $categoryScore = 1.0;
                $reasons[] = 'หมวดหมู่ตรงกัน';
            } else {
                $categoryScore = 0.3;
            }
        } else {
            $categoryScore = 0.5;
        }
        $total += $categoryScore * self::WEIGHTS['category'];

        $itemScore = Text::similarity((string) ($lost['itemName'] ?? ''), (string) ($found['description'] ?? ''));
        $total += $itemScore * self::WEIGHTS['item'];
        if ($itemScore > 0.6) {
            $reasons[] = 'ชื่อของคล้ายกัน (' . (int) round($itemScore * 100) . '%)';
        }

        $textScore = self::locationSimilarity(
            (string) ($lost['locationLost'] ?? ''),
            (string) ($found['locationFound'] ?? '')
        );
        $lostPoint = self::point($lost['locationCoords'] ?? null);
        $foundPoint = self::point($found['locationCoords'] ?? null);
        $pinScore = null;
        if ($lostPoint !== null && $foundPoint !== null) {
            $km = self::haversine($lostPoint, $foundPoint);
            $pinScore = self::distanceScore($km);
            $reasons[] = self::distanceReason($km);
        }
        $lostZone = self::zone($zones, $lostPoint, (string) ($lost['locationLost'] ?? ''));
        $foundZone = self::zone($zones, $foundPoint, (string) ($found['locationFound'] ?? ''));
        $zoneRel = self::zoneRelation($lostZone, $foundZone);
        $zoneScore = $zoneRel['score'] ?? null;
        if ($zoneRel !== null && ($zoneRel['reason'] ?? '') !== '' && $zoneRel['score'] >= 0.7) {
            $reasons[] = $zoneRel['reason'];
        }
        if ($pinScore !== null) {
            $locationScore = max($pinScore, $zoneScore ?? 0.0, $textScore * 0.5);
        } elseif ($zoneScore !== null) {
            $locationScore = max($zoneScore, $textScore);
        } else {
            $locationScore = $textScore;
        }
        $total += $locationScore * self::WEIGHTS['location'];
        $hasGeo = false;
        foreach ($reasons as $reason) {
            if (str_starts_with($reason, 'พิกัด') || str_starts_with($reason, 'โซน')) {
                $hasGeo = true;
                break;
            }
        }
        if ($locationScore > 0.5 && !$hasGeo) {
            $reasons[] = 'สถานที่ใกล้เคียง (' . (int) round($locationScore * 100) . '%)';
        }

        $descriptionScore = 0.0;
        if (($lost['description'] ?? '') !== '' && ($found['description'] ?? '') !== '') {
            $descriptionScore = Text::similarity((string) $lost['description'], (string) $found['description']);
        }
        $total += $descriptionScore * self::WEIGHTS['description'];
        if ($descriptionScore > 0.4) {
            $reasons[] = 'รายละเอียดคล้ายกัน (' . (int) round($descriptionScore * 100) . '%)';
        }

        $days = abs(self::unix($lost['dateLost'] ?? null) - self::unix($found['dateFound'] ?? null)) / 86400;
        $timeScore = 0.0;
        if ($days <= 1) {
            $timeScore = 1.0;
            $reasons[] = 'เวลาใกล้เคียง (ภายใน 1 วัน)';
        } elseif ($days <= 3) {
            $timeScore = 0.8;
            $reasons[] = 'เวลาใกล้เคียง (ภายใน 3 วัน)';
        } elseif ($days <= 7) {
            $timeScore = 0.5;
            $reasons[] = 'เวลาใกล้เคียง (ภายใน 7 วัน)';
        } elseif ($days <= 14) {
            $timeScore = 0.2;
        }
        $total += $timeScore * self::WEIGHTS['time'];

        $itemText = mb_strtolower(trim(((string) ($lost['itemName'] ?? '')) . ' ' . ((string) ($lost['description'] ?? ''))), 'UTF-8');
        $foundText = mb_strtolower(trim(
            ((string) ($found['itemName'] ?? '')) . ' ' . ((string) ($found['description'] ?? '')) . ' '
            . ((string) ($found['brand'] ?? '')) . ' ' . ((string) ($found['color'] ?? ''))
        ), 'UTF-8');
        $brand = trim((string) ($found['brand'] ?? ''));
        $brandMatched = false;
        if ($brand !== '' && str_contains($itemText, mb_strtolower($brand, 'UTF-8'))) {
            $total += 0.1;
            $reasons[] = 'ยี่ห้อตรงกัน (' . $brand . ')';
            $brandMatched = true;
        }
        if (!$brandMatched) {
            foreach (self::BRANDS as $known) {
                if (str_contains($itemText, $known) && str_contains($foundText, $known)) {
                    $total += 0.1;
                    $reasons[] = 'ยี่ห้อตรงกัน (' . $known . ')';
                    break;
                }
            }
        }
        $color = trim((string) ($found['color'] ?? ''));
        $colorMatched = false;
        if ($color !== '' && str_contains($itemText, mb_strtolower($color, 'UTF-8'))) {
            $total += 0.05;
            $reasons[] = 'สีตรงกัน (' . $color . ')';
            $colorMatched = true;
        }
        if (!$colorMatched) {
            foreach (self::COLORS as $known) {
                if (str_contains($itemText, $known) && str_contains($foundText, $known)) {
                    $total += 0.05;
                    $already = false;
                    foreach ($reasons as $reason) {
                        if (str_contains($reason, 'สี')) {
                            $already = true;
                            break;
                        }
                    }
                    if (!$already) {
                        $reasons[] = 'สีตรงกัน (' . $known . ')';
                    }
                    break;
                }
            }
        }

        return [
            'lostItem' => $lost,
            'foundItem' => $found,
            'score' => min($total, 1.0),
            'reasons' => $reasons,
        ];
    }

    private static function foundCategory(array $found): ?string
    {
        $category = trim((string) ($found['category'] ?? ''));
        if ($category !== '') {
            return $category;
        }
        return self::detectCategory((string) ($found['description'] ?? ''));
    }

    private static function within(array $items, int $anchor, string $field): array
    {
        if ($anchor <= 0) {
            return $items;
        }
        return array_values(array_filter($items, static function (array $item) use ($anchor, $field): bool {
            $when = self::unix($item[$field] ?? null);
            if ($when <= 0) {
                return false;
            }
            return abs($when - $anchor) / 86400 <= self::TIME_WINDOW_DAYS;
        }));
    }

    private static function locationSimilarity(string $left, string $right): float
    {
        $a = mb_strtolower($left, 'UTF-8');
        $b = mb_strtolower($right, 'UTF-8');
        if ($a === $b) {
            return 1.0;
        }
        foreach (self::LOCATIONS as $keywords) {
            $hasA = false;
            $hasB = false;
            foreach ($keywords as $keyword) {
                $needle = mb_strtolower($keyword, 'UTF-8');
                if (!$hasA && str_contains($a, $needle)) {
                    $hasA = true;
                }
                if (!$hasB && str_contains($b, $needle)) {
                    $hasB = true;
                }
            }
            if ($hasA && $hasB) {
                return 0.9;
            }
        }
        return Text::similarity($left, $right);
    }

    private static function distanceScore(float $km): float
    {
        if ($km <= 0.05) {
            return 1.0;
        }
        if ($km <= 0.15) {
            return 0.9;
        }
        if ($km <= 0.4) {
            return 0.75;
        }
        if ($km <= 1) {
            return 0.55;
        }
        if ($km <= 2) {
            return 0.35;
        }
        if ($km <= 5) {
            return 0.2;
        }
        return 0.05;
    }

    private static function distanceReason(float $km): string
    {
        $near = $km <= 0.4;
        if ($km < 1) {
            $meters = (int) round($km * 1000);
            return ($near ? 'พิกัดใกล้กัน (' : 'พิกัดห่างกัน (') . $meters . ' m)';
        }
        $label = $km < 10 ? number_format($km, 1, '.', '') . ' km' : (string) (int) round($km) . ' km';
        return ($near ? 'พิกัดใกล้กัน (' : 'พิกัดห่างกัน (') . $label . ')';
    }

    private static function point(mixed $coords): ?array
    {
        if (!is_array($coords) || !isset($coords['lat'], $coords['lng']) || !is_numeric($coords['lat']) || !is_numeric($coords['lng'])) {
            return null;
        }
        return ['lat' => (float) $coords['lat'], 'lng' => (float) $coords['lng']];
    }

    private static function haversine(array $a, array $b): float
    {
        $radius = 6371.0;
        $dLat = deg2rad($b['lat'] - $a['lat']);
        $dLng = deg2rad($b['lng'] - $a['lng']);
        $sinLat = sin($dLat / 2);
        $sinLng = sin($dLng / 2);
        $h = $sinLat * $sinLat + cos(deg2rad($a['lat'])) * cos(deg2rad($b['lat'])) * $sinLng * $sinLng;
        return 2 * $radius * atan2(sqrt($h), sqrt(max(0.0, 1 - $h)));
    }

    private static function zone(array $zones, ?array $point, string $text): ?array
    {
        if ($zones === []) {
            return null;
        }
        if ($point !== null) {
            foreach ($zones as $zone) {
                $polygon = $zone['polygon'] ?? [];
                if (is_array($polygon) && count($polygon) >= 3 && self::inside($point, $polygon)) {
                    return $zone;
                }
            }
        }
        $hay = mb_strtolower(trim($text), 'UTF-8');
        if ($hay === '') {
            return null;
        }
        foreach ($zones as $zone) {
            $name = mb_strtolower((string) ($zone['name'] ?? ''), 'UTF-8');
            if ($name !== '' && str_contains($hay, $name)) {
                return $zone;
            }
            foreach ($zone['aliases'] ?? [] as $alias) {
                $alias = mb_strtolower(trim((string) $alias), 'UTF-8');
                if ($alias !== '' && str_contains($hay, $alias)) {
                    return $zone;
                }
            }
        }
        return null;
    }

    private static function inside(array $point, array $polygon): bool
    {
        $inside = false;
        $j = count($polygon) - 1;
        for ($i = 0; $i < count($polygon); $i++) {
            $yi = (float) ($polygon[$i]['lat'] ?? 0);
            $xi = (float) ($polygon[$i]['lng'] ?? 0);
            $yj = (float) ($polygon[$j]['lat'] ?? 0);
            $xj = (float) ($polygon[$j]['lng'] ?? 0);
            $intersect = ($yi > $point['lat']) !== ($yj > $point['lat'])
                && $point['lng'] < (($xj - $xi) * ($point['lat'] - $yi)) / (($yj - $yi) ?: 1e-12) + $xi;
            if ($intersect) {
                $inside = !$inside;
            }
            $j = $i;
        }
        return $inside;
    }

    private static function zoneRelation(?array $lost, ?array $found): ?array
    {
        if ($lost === null || $found === null) {
            return null;
        }
        if (($lost['id'] ?? '') === ($found['id'] ?? '') && ($lost['id'] ?? '') !== '') {
            return ['score' => 1.0, 'reason' => 'โซนเดียวกัน (' . $lost['name'] . ')'];
        }
        $a = self::centroid($lost['polygon'] ?? []);
        $b = self::centroid($found['polygon'] ?? []);
        if ($a !== null && $b !== null && self::haversine($a, $b) <= 0.15) {
            return ['score' => 0.7, 'reason' => 'โซนข้างเคียง (' . $lost['name'] . ' / ' . $found['name'] . ')'];
        }
        return ['score' => 0.25, 'reason' => 'คนละโซน (' . $lost['name'] . ' / ' . $found['name'] . ')'];
    }

    private static function centroid(array $polygon): ?array
    {
        if ($polygon === []) {
            return null;
        }
        $lat = 0.0;
        $lng = 0.0;
        $n = 0;
        foreach ($polygon as $point) {
            if (!is_array($point) || !isset($point['lat'], $point['lng'])) {
                continue;
            }
            $lat += (float) $point['lat'];
            $lng += (float) $point['lng'];
            $n++;
        }
        if ($n === 0) {
            return null;
        }
        return ['lat' => $lat / $n, 'lng' => $lng / $n];
    }

    private static function unix(mixed $value): int
    {
        if (!is_string($value) || $value === '') {
            return 0;
        }
        $unix = strtotime($value);
        return $unix === false ? 0 : $unix;
    }
}
