<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Http\HttpError;

// Keyset is the normal walk (created_at, id). Offset is only for the first
// window and stops at 100 so a client cannot page the table with huge skips.
final class Page
{
    public static function read(array $query, int $default, int $max): array
    {
        $limit = self::number($query, 'limit', $default, 1, $max);
        $hasOffset = array_key_exists('offset', $query) && $query['offset'] !== '' && $query['offset'] !== null;
        $hasCursor = array_key_exists('cursor', $query) && $query['cursor'] !== '' && $query['cursor'] !== null;
        if ($hasOffset && $hasCursor) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        $offset = $hasOffset ? self::number($query, 'offset', 0, 0, 100) : null;
        $cursor = $hasCursor ? self::cursor($query['cursor']) : null;
        return [$limit, $offset, $cursor];
    }

    public static function encode(string $createdAt, string $id): string
    {
        $raw = $createdAt . '|' . $id;
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function next(array $rows, int $limit): array
    {
        $cursor = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $last = $rows[count($rows) - 1] ?? null;
            if (is_array($last)) {
                $cursor = self::encode((string) $last['created_at'], (string) $last['id']);
            }
        }
        return [$rows, $cursor];
    }

    private static function cursor(mixed $raw): array
    {
        if (!is_string($raw) || strlen($raw) > 120) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        $padded = strtr($raw, '-_', '+/');
        $pad = strlen($padded) % 4;
        if ($pad !== 0) {
            $padded .= str_repeat('=', 4 - $pad);
        }
        $decoded = base64_decode($padded, true);
        if (!is_string($decoded)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        $parts = explode('|', $decoded, 2);
        if (count($parts) !== 2) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        $stamp = $parts[0];
        $id = strtolower($parts[1]);
        if (preg_match('/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(\.\d{1,3})?$/', $stamp, $match) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        $frac = isset($match[2]) ? str_pad(substr($match[2], 0, 4), 4, '0') : '.000';
        $stamp = $match[1] . $frac;
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'cursor']);
        }
        return [$stamp, $id];
    }

    private static function number(array $query, string $key, int $default, int $min, int $max): int
    {
        if (!array_key_exists($key, $query) || $query[$key] === '' || $query[$key] === null) {
            return $default;
        }
        $raw = $query[$key];
        if (!is_string($raw) || preg_match('/^\d+$/', $raw) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => $key]);
        }
        $number = (int) $raw;
        if ($number < $min || $number > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $key]);
        }
        return $number;
    }
}
