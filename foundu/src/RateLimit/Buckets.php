<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

use Foundu\Config;

// PLAN §7.3. The middleware applies the IP buckets. Presign is per account,
// so the upload route calls Limiter itself with presign().
final class Buckets
{
    public static function forPath(string $path, array $config): array
    {
        if ($path === '/auth' || str_starts_with($path, '/auth/')) {
            return [
                'ip_auth',
                Config::int($config, 'RATE_LIMIT_AUTH_PER_MINUTE', 10, 1, 100000),
                60,
            ];
        }
        return [
            'ip_api',
            Config::int($config, 'RATE_LIMIT_API_PER_MINUTE', 120, 1, 100000),
            60,
        ];
    }

    public static function presign(array $config): array
    {
        return [
            'account_presign',
            Config::int($config, 'RATE_LIMIT_PRESIGN_PER_HOUR', 20, 1, 100000),
            3600,
        ];
    }
}
