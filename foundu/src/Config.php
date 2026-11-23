<?php

declare(strict_types=1);

namespace Foundu;

use RuntimeException;

final class Config
{
    public const KEYS = [
        'APP_ENV',
        'APP_URL',
        'APP_KEY',
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASS',
        'SCHOOL_AUTH_DOMAIN',
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
        'R2_PUBLIC_BASE_URL',
        'R2_ENDPOINT',
        'R2_REGION',
        'GEMINI_API_KEY',
        'GEMMA_API_KEY',
        'OPENROUTER_API_KEY',
        'OPENROUTER_MODEL',
        'TURNSTILE_SITE_KEY',
        'TURNSTILE_SECRET',
        'AI_MAX_CONCURRENCY',
        'RATE_LIMIT_API_PER_MINUTE',
        'RATE_LIMIT_AUTH_PER_MINUTE',
        'RATE_LIMIT_PRESIGN_PER_HOUR',
        'SESSION_IDLE_SECONDS',
        'SESSION_ABSOLUTE_SECONDS',
        'TURNSTILE_ENABLED',
        'BODY_MAX_BYTES',
        'BODY_MAX_AI_BYTES',
        'AI_QUOTA_PER_MINUTE',
        'AI_QUOTA_PER_HOUR',
        'AI_SYSTEM_QUOTA_PER_MINUTE',
        'AI_SYSTEM_QUOTA_PER_HOUR',
        'AI_SLOT_LEASE_SECONDS',
        'LOGIN_LOCK_ACCOUNT_LIMIT',
        'LOGIN_LOCK_ACCOUNT_SECONDS',
        'LOGIN_LOCK_IP_LIMIT',
        'LOGIN_LOCK_IP_SECONDS',
        'SEARCH_SIMILARITY_THRESHOLD',
        'AGENT_SEARCH_SIMILARITY_THRESHOLD',
    ];

    public static function int(array $config, string $key, int $default, int $min, int $max): int
    {
        $raw = $config[$key] ?? $default;
        if (is_int($raw)) {
            $value = $raw;
        } elseif (is_string($raw) && preg_match('/^\d+$/', $raw) === 1) {
            $value = (int) $raw;
        } else {
            $value = $default;
        }
        if ($value < $min) {
            return $min;
        }
        if ($value > $max) {
            return $max;
        }
        return $value;
    }

    public static function load(string $appRoot): array
    {
        $path = $appRoot . '/config/.env.php';
        $values = [];
        if (is_file($path)) {
            $loaded = require $path;
            if (!is_array($loaded)) {
                throw new RuntimeException('config/.env.php must return an array');
            }
            $values = $loaded;
        }

        foreach (self::KEYS as $key) {
            $env = getenv($key);
            if ($env !== false && $env !== '') {
                $values[$key] = $env;
            }
        }

        if (($values['GEMINI_API_KEY'] ?? '') === '' && ($values['GEMMA_API_KEY'] ?? '') !== '') {
            $values['GEMINI_API_KEY'] = $values['GEMMA_API_KEY'];
        }

        return $values;
    }
}
