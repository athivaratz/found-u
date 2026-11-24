<?php

declare(strict_types=1);

namespace Foundu\Agent;

// Same school-boundary check as lib/found-location-guard.ts. Coordinates
// come from the chat request, never from the model's tool arguments.
final class Fence
{
    public const MAX_ACCURACY = 150;

    public static function allow(?array $coords, array $settings, bool $bypass): array
    {
        if ($bypass) {
            return ['ok' => true];
        }
        if (($settings['mapEnforceFoundInSchool'] ?? true) === false) {
            return ['ok' => true];
        }
        $polygon = self::polygon($settings['mapSchoolBoundary'] ?? []);
        if (count($polygon) < 3) {
            return [
                'ok' => false,
                'code' => 'boundary_not_configured',
                'message' => 'ระบบเปิดบังคับตรวจตำแหน่งแล้ว แต่ยังไม่ได้ตั้งค่าขอบเขตโรงเรียน กรุณาติดต่อผู้ดูแลระบบ',
            ];
        }
        if ($coords === null) {
            return [
                'ok' => false,
                'code' => 'missing_coords',
                'message' => 'ยังดำเนินการแจ้งเจอของให้ไม่ได้ เพราะยังไม่ได้รับตำแหน่งจากอุปกรณ์ กรุณาอนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่อีกครั้ง หรือมาแจ้งเมื่ออยู่ในโรงเรียน',
            ];
        }
        $accuracy = $coords['accuracy'] ?? null;
        if (is_float($accuracy) && $accuracy > self::MAX_ACCURACY) {
            return [
                'ok' => false,
                'code' => 'low_accuracy',
                'message' => 'ตำแหน่งยังไม่แม่นยำพอ (ต้องไม่เกิน ' . self::MAX_ACCURACY . ' เมตร) กรุณาเปิด Precise Location / GPS แล้วลองใหม่เมื่ออยู่ในโรงเรียน',
            ];
        }
        if (!self::inside($coords, $polygon)) {
            return [
                'ok' => false,
                'code' => 'outside',
                'message' => 'ยังดำเนินการแจ้งเจอของให้ไม่ได้ เพราะตำแหน่งอยู่นอกพื้นที่โรงเรียน — แจ้งเจอได้เฉพาะเมื่ออยู่ในโรงเรียนเท่านั้น (แจ้งของหายทำได้จากที่บ้านตามปกติ)',
            ];
        }
        return ['ok' => true];
    }

    private static function polygon(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        if (!array_is_list($value)) {
            $keys = array_filter(array_keys($value), static fn ($key): bool => is_string($key) && preg_match('/^\d+$/', $key) === 1);
            usort($keys, static fn ($a, $b): int => (int) $a <=> (int) $b);
            $value = array_map(static fn ($key) => $value[$key], $keys);
        }
        $points = [];
        foreach ($value as $point) {
            if (!is_array($point) || !is_numeric($point['lat'] ?? null) || !is_numeric($point['lng'] ?? null)) {
                continue;
            }
            $points[] = ['lat' => (float) $point['lat'], 'lng' => (float) $point['lng']];
        }
        return $points;
    }

    private static function inside(array $point, array $polygon): bool
    {
        $inside = false;
        $count = count($polygon);
        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            $yi = $polygon[$i]['lat'];
            $xi = $polygon[$i]['lng'];
            $yj = $polygon[$j]['lat'];
            $xj = $polygon[$j]['lng'];
            $cross = ($yi > $point['lat']) !== ($yj > $point['lat'])
                && $point['lng'] < (($xj - $xi) * ($point['lat'] - $yi)) / (($yj - $yi) ?: 1e-12) + $xi;
            if ($cross) {
                $inside = !$inside;
            }
        }
        return $inside;
    }
}
