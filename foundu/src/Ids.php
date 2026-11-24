<?php

declare(strict_types=1);

namespace Foundu;

// Identifiers the app creates itself. MariaDB does not generate them.
final class Ids
{
    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }

    public static function token(int $bytes = 32): string
    {
        $raw = random_bytes($bytes);
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function sha256(string $value): string
    {
        return hash('sha256', $value);
    }

    public static function utc(int $unix): string
    {
        return gmdate('Y-m-d H:i:s', $unix) . '.000';
    }

    public static function unix(string $value): int
    {
        $value = str_replace('T', ' ', trim($value));
        $value = rtrim($value, 'Z');
        if (preg_match('/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/', $value, $match) !== 1) {
            return 0;
        }
        $parsed = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $match[1], new \DateTimeZone('UTC'));
        return $parsed instanceof \DateTimeImmutable ? $parsed->getTimestamp() : 0;
    }
}
