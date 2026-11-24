<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Match\Engine;

final class Ner
{
    private const CATEGORIES = ['wallet', 'phone', 'keys', 'bag', 'electronics', 'documents', 'clothing', 'accessories', 'other'];
    private const CONTACTS = ['phone', 'line', 'instagram', 'facebook', 'email'];

    public static function extract(Generate $generate, Credentials $credentials, string $text, string $type, array $settings): array
    {
        $generation = [
            'model' => (string) ($settings['aiNerModel'] ?? 'gemini-1.5-flash'),
            'temperature' => self::num($settings['aiNerTemperature'] ?? 0.1),
            'topP' => self::num($settings['aiNerTopP'] ?? 0.8),
            'maxOutputTokens' => (int) ($settings['aiNerMaxOutputTokens'] ?? 256),
        ];
        $result = $generate->text($credentials, Prompts::ner($text), $generation);
        if ($result === null) {
            return self::fallback($text, $type);
        }
        $parsed = Parse::jsonObject($result->text);
        if ($parsed === null) {
            return self::fallback($text, $type);
        }
        $normalized = self::normalize($parsed, $type);
        if ($normalized['item'] === '') {
            $fallback = self::fallback($text, $type);
            $normalized['item'] = $fallback['item'];
        }
        return $normalized;
    }

    public static function normalize(array $parsed, string $type): array
    {
        $category = $parsed['category'] ?? null;
        if (!is_string($category) || !in_array($category, self::CATEGORIES, true)) {
            $category = null;
        }
        $contactType = $parsed['contactType'] ?? null;
        if (!is_string($contactType) || !in_array($contactType, self::CONTACTS, true)) {
            $contactType = null;
        }
        $target = $parsed['target'] ?? null;
        if ($target !== 'lost' && $target !== 'found') {
            $target = $type;
        }
        return [
            'item' => trim((string) ($parsed['item'] ?? '')),
            'description' => self::nullable($parsed['description'] ?? null),
            'location' => self::nullable($parsed['location'] ?? null),
            'time' => self::nullable($parsed['time'] ?? null),
            'contact' => self::nullable($parsed['contact'] ?? null),
            'contactType' => $contactType,
            'category' => $category,
            'remark' => self::nullable($parsed['remark'] ?? null),
            'target' => $target,
        ];
    }

    public static function fallback(string $text, string $target): array
    {
        $trimmed = trim($text);
        $category = Engine::detectCategory($trimmed) ?? self::guess($trimmed);
        $time = null;
        if (preg_match('/(?:เวลา|ตอน|ประมาณ)?\s*(\d{1,2}[.:]\d{2}(?:\s*น\.?)?|\d{1,2}\s*โมง(?:\s*(?:เช้า|บ่าย|เย็น))?)/u', $trimmed, $timeMatch) === 1) {
            $time = trim($timeMatch[1]);
        }
        $brand = null;
        if (preg_match('/ยี่ห้อ\s*([^\s,]+)/u', $trimmed, $brandMatch) === 1) {
            $brand = $brandMatch[1];
        }
        $location = null;
        if (preg_match('/(?:หาย(?:ที่|แถว)?|เจอ(?:ที่|แถว)?|ที่|แถว)\s*([^,.\n]+)/u', $trimmed, $locMatch) === 1) {
            $location = trim($locMatch[1]);
        }
        $feature = null;
        if (preg_match('/(?:ลักษณะเด่น|จุดเด่น|มี)\s*([^,.\n]+)/u', $trimmed, $featureMatch) === 1) {
            $feature = trim($featureMatch[1]);
        }
        $item = 'สิ่งของ';
        if (preg_match('/หูฟัง/u', $trimmed) === 1) {
            $item = 'หูฟัง';
        } elseif (preg_match('/กุญแจ/u', $trimmed) === 1) {
            $item = 'กุญแจ';
        } elseif (preg_match('/โทรศัพท์|มือถือ/u', $trimmed) === 1) {
            $item = 'โทรศัพท์';
        } elseif (preg_match('/กระเป๋า/u', $trimmed) === 1) {
            $item = 'กระเป๋า';
        } elseif (preg_match('/บัตร/u', $trimmed) === 1) {
            $item = 'บัตร';
        } else {
            $first = trim(explode(',', str_replace('.', ',', $trimmed))[0]);
            if ($first !== '' && mb_strlen($first, 'UTF-8') < 40) {
                $first = trim(preg_replace('/^แจ้ง/u', '', $first) ?? $first);
                if ($first !== '') {
                    $item = $first;
                }
            }
        }
        $parts = [];
        if ($brand !== null) {
            $parts[] = 'ยี่ห้อ ' . $brand;
        }
        if ($feature !== null) {
            $parts[] = $feature;
        }
        return [
            'item' => $item,
            'description' => $parts === [] ? null : implode(', ', $parts),
            'location' => $location,
            'time' => $time,
            'contact' => self::contact($trimmed),
            'contactType' => self::contactType($trimmed),
            'category' => $category,
            'remark' => null,
            'target' => $target,
        ];
    }

    private static function guess(string $text): string
    {
        if (preg_match('/หูฟัง|airpod|earphone|headphone/iu', $text) === 1) {
            return 'electronics';
        }
        if (preg_match('/กุญแจ/u', $text) === 1) {
            return 'keys';
        }
        if (preg_match('/โทรศัพท์|มือถือ|iphone|samsung/iu', $text) === 1) {
            return 'phone';
        }
        if (preg_match('/บัตร|เอกสาร/u', $text) === 1) {
            return 'documents';
        }
        if (preg_match('/เสื้อ|กางเกง|หมวก/u', $text) === 1) {
            return 'clothing';
        }
        return 'other';
    }

    private static function contact(string $text): ?string
    {
        if (preg_match('/0\d[\d-]{7,10}/', $text, $phone) === 1) {
            return $phone[0];
        }
        if (preg_match('/(?:line|ไลน์)[:\s]*@?[\w.]+/iu', $text, $line) === 1) {
            return $line[0];
        }
        return null;
    }

    private static function contactType(string $text): ?string
    {
        if (preg_match('/0\d[\d-]{7,10}/', $text) === 1) {
            return 'phone';
        }
        if (preg_match('/(?:line|ไลน์)/iu', $text) === 1) {
            return 'line';
        }
        if (preg_match('/(?:ig|instagram)/iu', $text) === 1) {
            return 'instagram';
        }
        if (preg_match('/(?:fb|facebook|เฟส)/iu', $text) === 1) {
            return 'facebook';
        }
        if (preg_match('/@.+\.(com|co\.th)/i', $text) === 1) {
            return 'email';
        }
        return null;
    }

    private static function nullable(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value) && !is_numeric($value)) {
            return null;
        }
        $text = trim((string) $value);
        return $text === '' ? null : $text;
    }

    private static function num(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.1;
    }
}
