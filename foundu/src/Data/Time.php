<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Http\HttpError;
use Foundu\Ids;

final class Time
{
    public static function iso(mixed $value): ?string
    {
        if (!is_string($value) || $value === '') {
            return null;
        }
        if (preg_match('/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,6})?/', $value, $match) !== 1) {
            return null;
        }
        $digits = isset($match[3]) ? substr($match[3], 1, 3) : '000';
        $digits = str_pad($digits, 3, '0');
        return $match[1] . 'T' . $match[2] . '.' . $digits . 'Z';
    }

    public static function sql(mixed $value, string $field): string
    {
        if (!is_string($value) || strlen($value) > 40) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $flat = rtrim(str_replace('T', ' ', trim($value)), 'Z');
        if (preg_match('/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/', $flat, $match) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $frac = isset($match[3]) ? str_pad(substr($match[3], 0, 4), 4, '0') : '.000';
        $sql = $match[1] . ' ' . $match[2] . $frac;
        $unix = Ids::unix($sql);
        $min = gmmktime(0, 0, 0, 1, 1, 2000);
        if ($unix < $min || $unix > time() + 86400 * 366 * 2) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $sql;
    }
}
