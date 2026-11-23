<?php

declare(strict_types=1);

namespace Foundu;

// Monolog 3.13 stops log lines from pulling {placeholders} out of context.
// This still drops values whose keys look like secrets, so a later formatter
// cannot write a cookie or a password into foundu/storage/logs.
final class Redact
{
    public static function context(array $values, int $depth = 0): array
    {
        if ($depth > 4) {
            return ['redacted' => 'nested'];
        }
        $clean = [];
        foreach ($values as $key => $value) {
            $name = is_string($key) ? $key : (string) $key;
            if (preg_match('/password|secret|token|cookie|authorization|csrf|pin|app_key|api_key/i', $name) === 1) {
                $clean[$name] = '[redacted]';
                continue;
            }
            if (is_array($value)) {
                $clean[$name] = self::context($value, $depth + 1);
                continue;
            }
            if (is_string($value)) {
                $clean[$name] = str_replace(["\r", "\n"], ' ', $value);
                continue;
            }
            if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
                $clean[$name] = $value;
                continue;
            }
            $clean[$name] = 'unprintable';
        }
        return $clean;
    }
}
