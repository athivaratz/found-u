<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Http\HttpError;

final class Values
{
    public const STATUSES = ['searching', 'pending_room_confirm', 'found', 'claimed', 'expired'];
    private const CONTACT_TYPES = ['phone', 'line', 'instagram', 'facebook', 'email'];
    private const SOURCES = ['gps', 'map', 'manual'];

    public static function only(array $body, array $allowed): void
    {
        foreach ($body as $key => $unused) {
            if (!is_string($key) || !in_array($key, $allowed, true)) {
                throw new HttpError(400, 'invalid_input', ['field' => is_string($key) ? $key : 'body']);
            }
        }
    }

    public static function text(mixed $value, string $field, int $max, bool $required): ?string
    {
        if ($value === null || $value === '') {
            if ($required) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            return null;
        }
        if (!is_string($value) || str_contains($value, "\0") || mb_strlen($value) > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $value;
    }

    public static function status(mixed $value, string $field): string
    {
        $text = self::text($value, $field, 32, true);
        if (!in_array($text, self::STATUSES, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $text;
    }

    public static function uuid(mixed $value, string $field, bool $required): ?string
    {
        $text = self::text($value, $field, 36, $required);
        if ($text === null) {
            return null;
        }
        $text = strtolower($text);
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $text) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $text;
    }

    public static function tracking(mixed $value, string $prefix): string
    {
        $text = self::text($value, 'trackingCode', 32, true);
        $text = strtoupper($text);
        if (preg_match('/^' . $prefix . '-[A-Z0-9]{4,12}$/', $text) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'trackingCode']);
        }
        return $text;
    }

    public static function httpsOrPath(mixed $value, string $field, bool $required): ?string
    {
        $text = self::text($value, $field, 2048, $required);
        if ($text === null) {
            return null;
        }
        if (str_contains($text, '..') || preg_match('/\s/', $text) === 1) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        if (str_starts_with($text, 'https://')) {
            return $text;
        }
        if (preg_match('#^/[A-Za-z0-9._~/%+-]*$#', $text) === 1) {
            return $text;
        }
        throw new HttpError(400, 'invalid_input', ['field' => $field]);
    }

    public static function contacts(mixed $value, string $field, bool $required): string
    {
        if ($value === null) {
            if ($required) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            return '[]';
        }
        if (!is_array($value) || !array_is_list($value) || count($value) > 8) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $clean = [];
        foreach ($value as $entry) {
            if (!is_array($entry) || array_is_list($entry)) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            $type = self::text($entry['type'] ?? null, $field, 32, true);
            if (!in_array($type, self::CONTACT_TYPES, true)) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            $contact = self::text($entry['value'] ?? null, $field, 120, true);
            if (count($entry) !== 2) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            $clean[] = ['type' => $type, 'value' => $contact];
        }
        if ($required && $clean === []) {
            return '[]';
        }
        return json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public static function coords(mixed $value, string $field): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value) || array_is_list($value)) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $point = self::point($value, $field);
        if (array_key_exists('accuracy', $value)) {
            $point['accuracy'] = self::number($value['accuracy'], $field, 0, 100000);
        }
        if (array_key_exists('source', $value) && $value['source'] !== null) {
            $source = self::text($value['source'], $field, 16, true);
            if (!in_array($source, self::SOURCES, true)) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            $point['source'] = $source;
        }
        $allowed = ['lat', 'lng', 'accuracy', 'source'];
        foreach ($value as $key => $unused) {
            if (!in_array($key, $allowed, true)) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
        }
        return json_encode($point, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public static function point(array $value, string $field): array
    {
        return [
            'lat' => self::number($value['lat'] ?? null, $field, -90, 90),
            'lng' => self::number($value['lng'] ?? null, $field, -180, 180),
        ];
    }

    public static function number(mixed $value, string $field, float $min, float $max): float
    {
        if (is_int($value)) {
            $number = (float) $value;
        } elseif (is_float($value)) {
            $number = $value;
        } else {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        if (!is_finite($number) || $number < $min || $number > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $number;
    }

    public static function bool(mixed $value, string $field): bool
    {
        if (!is_bool($value)) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $value;
    }

    public static function jsonList(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        try {
            $decoded = json_decode($value, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return [];
        }
        return is_array($decoded) ? $decoded : [];
    }

    public static function jsonObject(mixed $value): ?array
    {
        if (is_array($value) && !array_is_list($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return null;
        }
        try {
            $decoded = json_decode($value, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        return is_array($decoded) && !array_is_list($decoded) ? $decoded : null;
    }

    public static function flag(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1';
    }
}
