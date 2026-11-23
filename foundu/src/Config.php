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
        'SEARCH_SIMILARITY_THRESHOLD',
        'AGENT_SEARCH_SIMILARITY_THRESHOLD',
    ];

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
