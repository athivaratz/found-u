<?php

declare(strict_types=1);

namespace Foundu\Cron;

use Foundu\Data\Geocode;
use Foundu\Data\Site;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Log;
use Foundu\Seo\OgImage;
use Foundu\Storage\R2Put;
use PDO;
use Throwable;

// The jobs bin/cron.php runs after the short cleanup. Each one stops
// when its own budget is gone. A failure here is logged and the next
// job still runs. The lock in cron.php is unchanged.
final class Tasks
{
    public static function run(PDO $pdo, array $config, string $appRoot, int $now): array
    {
        $lines = [];
        $lines[] = self::guard('expire', 10, $now, static function () use ($pdo): string {
            return 'expired ' . Site::expireRows($pdo);
        });
        $lines[] = self::guard('chat', 15, $now, static function () use ($pdo, $now): string {
            return 'chat_logs ' . self::chat($pdo, $now);
        });
        $lines[] = self::guard('geocode_cache', 5, $now, static function () use ($pdo, $now): string {
            return 'geocode_cache ' . Geocode::purge($pdo, $now);
        });
        $lines[] = self::guard('og_cache', 5, $now, static function () use ($appRoot, $now): string {
            return 'og_cache ' . OgImage::prune($appRoot, $now);
        });
        $lines[] = self::guard('cloudflare', 20, $now, static function () use ($appRoot, $now): string {
            return self::cloudflare($appRoot, $now);
        });
        $lines[] = self::guard('dump', 60, $now, static function () use ($pdo, $config, $appRoot, $now): string {
            return self::dump($pdo, $config, $appRoot, $now);
        });
        return array_values(array_filter($lines, static fn (string $line): bool => $line !== ''));
    }

    public static function chat(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM agent_chat_logs WHERE created_at < ? ORDER BY created_at ASC LIMIT 500',
            [Ids::utc($now - 7 * 86400)]
        )->rowCount();
    }

    private static function cloudflare(string $appRoot, int $now): string
    {
        $stamp = $appRoot . '/storage/cache/cf-ips-refreshed';
        if (!CloudflareList::due($stamp, $now)) {
            return 'cf-ips skipped';
        }
        $root = dirname($appRoot);
        return CloudflareList::refresh(
            $root . '/public_html/.htaccess',
            $appRoot . '/config/cloudflare-ips.php',
            $stamp,
            $now
        );
    }

    private static function dump(PDO $pdo, array $config, string $appRoot, int $now): string
    {
        $stamp = $appRoot . '/storage/cache/db-dump-refreshed';
        if (is_file($stamp)) {
            $raw = trim((string) file_get_contents($stamp));
            if (preg_match('/^\d+$/', $raw) === 1 && $now - (int) $raw < 20 * 3600) {
                return 'dump skipped';
            }
        }
        $put = R2Put::fromConfig($config);
        if ($put === null) {
            return 'dump skipped';
        }
        $dir = $appRoot . '/storage/cache';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $path = $dir . '/db-dump.sql.gz';
        $deadline = time() + 50;
        try {
            SqlDump::write($pdo, $path, $deadline);
            $key = 'backups/foundu-' . gmdate('Ymd\THis\Z', $now) . '.sql.gz';
            $put->putFile($key, 'application/gzip', $path);
            file_put_contents($stamp, (string) $now);
            return 'dump ' . $key;
        } finally {
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    private static function guard(string $name, int $budget, int $now, callable $work): string
    {
        if (time() > $now + 110) {
            return $name . ' skipped';
        }
        if (function_exists('set_time_limit')) {
            @set_time_limit($budget + 5);
        }
        $deadline = time() + $budget;
        try {
            $line = $work();
            if (time() > $deadline + 1) {
                Log::get()->warning('cron task ran past its budget', ['task' => $name]);
            }
            return is_string($line) ? $line : $name;
        } catch (Throwable $e) {
            Log::get()->error('cron task failed', ['task' => $name, 'class' => $e::class]);
            return $name . ' error';
        }
    }
}
