<?php

declare(strict_types=1);

namespace Foundu\Validation;

use Foundu\Http\HttpError;

// Small checks for JSON bodies. Routes that need the old Thai sentence
// can catch HttpError and replace `error` with the contract string.
final class Input
{
    public static function object(mixed $body): array
    {
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input');
        }
        return $body;
    }

    public static function string(array $body, string $key, int $max, bool $required = true): string
    {
        if (!array_key_exists($key, $body) || $body[$key] === null || $body[$key] === '') {
            if (!$required) {
                return '';
            }
            throw self::bad($key);
        }
        if (!is_string($body[$key])) {
            throw self::bad($key);
        }
        $value = $body[$key];
        if (str_contains($value, "\0") || strlen($value) > $max || mb_strlen($value) > $max) {
            throw self::bad($key);
        }
        return $value;
    }

    public static function optionalString(array $body, string $key, int $max): ?string
    {
        if (!array_key_exists($key, $body) || $body[$key] === null || $body[$key] === '') {
            return null;
        }
        $value = self::string($body, $key, $max, true);
        return $value;
    }

    public static function studentId(array $body, string $key = 'studentId'): string
    {
        $value = self::string($body, $key, 5);
        if (preg_match('/^\d{5}$/', $value) !== 1) {
            throw self::bad($key);
        }
        return $value;
    }

    public static function uuid(array $body, string $key): string
    {
        $value = strtolower(self::string($body, $key, 36));
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value) !== 1) {
            throw self::bad($key);
        }
        return $value;
    }

    public static function enum(array $body, string $key, array $allowed): string
    {
        $value = self::string($body, $key, 64);
        if (!in_array($value, $allowed, true)) {
            throw self::bad($key);
        }
        return $value;
    }

    public static function int(array $body, string $key, int $min, int $max): int
    {
        if (!array_key_exists($key, $body)) {
            throw self::bad($key);
        }
        $value = $body[$key];
        if (is_bool($value)) {
            throw self::bad($key);
        }
        if (is_int($value)) {
            $number = $value;
        } elseif (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
            $number = (int) $value;
        } else {
            throw self::bad($key);
        }
        if ($number < $min || $number > $max) {
            throw self::bad($key);
        }
        return $number;
    }

    private static function bad(string $key): HttpError
    {
        return new HttpError(400, 'invalid_input', ['field' => $key]);
    }
}
