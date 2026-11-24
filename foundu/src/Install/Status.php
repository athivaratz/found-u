<?php

declare(strict_types=1);

namespace Foundu\Install;

use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Data\Gate;
use Foundu\Http\HttpError;
use Foundu\Http\Json;
use Foundu\Platform;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Throwable;

// Admin-only snapshot. Values of keys are never included, only whether they
// are set. Migrations run from the files on disk, one slice per click.
final class Status
{
    public static function register(App $app, array $config, \Closure $pdo, string $appRoot): void
    {
        $app->get('/admin/system-status', static function ($request, $response) use ($config, $pdo, $appRoot) {
            self::admin($request);
            return Json::write($response, 200, self::read($config, Gate::db($pdo), $appRoot));
        });
        $app->post('/admin/system-status/migrations', static function ($request, $response) use ($pdo, $appRoot) {
            self::admin($request);
            return self::migrate($response, Gate::db($pdo), $appRoot);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public static function read(array $config, PDO $pdo, string $appRoot): array
    {
        $version = '';
        $bytes = null;
        try {
            $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
            $size = $pdo->query(
                'SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = DATABASE()'
            )->fetchColumn();
            $bytes = is_numeric($size) ? (int) $size : null;
        } catch (Throwable) {
            $version = '';
            $bytes = null;
        }

        $extensions = [];
        foreach (['pdo_mysql', 'sodium', 'mbstring', 'intl', 'curl', 'json', 'gd', 'apcu', 'openssl'] as $name) {
            $extensions[$name] = extension_loaded($name);
        }

        $pending = [];
        try {
            $pending = Migrator::pending($pdo, $appRoot . '/migrations');
        } catch (Throwable) {
            $pending = [];
        }

        $flag = strtolower(trim((string) ($config['SIGNUPS_ENABLED'] ?? '1')));
        $signups = !in_array($flag, ['0', 'false', 'off', 'no'], true);

        return [
            'php' => [
                'version' => PHP_VERSION,
                'eol' => self::eolText(),
            ],
            'extensions' => $extensions,
            'database' => [
                'version' => $version,
                'bytes' => $bytes,
                'accepted' => $version !== '' && Platform::acceptsMariaDb($version),
            ],
            'cron' => self::cron($pdo, $appRoot),
            'backup' => self::backup($appRoot),
            'migrations' => ['pending' => $pending],
            'disk' => self::disk($appRoot),
            'config' => [
                'turnstile' => self::filled($config, ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET']),
                'ai' => self::anyFilled($config, ['GEMINI_API_KEY', 'OPENROUTER_API_KEY']),
                'r2' => self::filled($config, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']),
                'signupsEnabled' => $signups,
            ],
            'errors' => ['recent' => self::errors($pdo, $appRoot)],
        ];
    }

    private static function admin(ServerRequestInterface $request): void
    {
        Authz::requireRole(Gate::actor($request), Actor::ADMIN);
    }

    private static function migrate(ResponseInterface $response, PDO $pdo, string $appRoot): ResponseInterface
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(25);
        }
        $deadline = time() + 18;
        try {
            $result = Migrator::advance(
                $pdo,
                $appRoot . '/migrations',
                $appRoot . '/storage/cache/migrate-progress.json',
                $deadline,
                0
            );
        } catch (Throwable $e) {
            throw new HttpError(500, 'migration_failed');
        }
        return Json::write($response, 200, [
            'done' => $result['done'],
            'ran' => $result['ran'],
            'file' => $result['file'],
            'pending' => $result['pending'],
        ]);
    }

    private static function eolText(): ?string
    {
        if (PHP_VERSION_ID >= 80300) {
            return null;
        }
        $ended = Platform::eolWarning();
        if (is_string($ended)) {
            return $ended;
        }
        return 'PHP 8.2 หมดอายุวันที่ 31 ธันวาคม 2026 เลือก 8.3 หรือ 8.4 ใน Select PHP Version';
    }

    /**
     * @return array{lastRun: string|null, busy: bool}
     */
    private static function cron(PDO $pdo, string $appRoot): array
    {
        $last = null;
        $stamp = $appRoot . '/storage/cache/cron-last-run';
        if (is_file($stamp)) {
            $raw = trim((string) file_get_contents($stamp));
            if (preg_match('/^\d+$/', $raw) === 1) {
                $last = gmdate('Y-m-d\TH:i:s\Z', (int) $raw);
            }
        }
        $busy = false;
        try {
            $until = $pdo->query("SELECT locked_until FROM cron_lock WHERE name = 'cron'")->fetchColumn();
            if (is_string($until) && $until !== '') {
                $until = preg_replace('/\.\d+$/', '', $until) ?? $until;
                $busy = strtotime($until . ' UTC') > time();
            }
        } catch (Throwable) {
            $busy = false;
        }
        return ['lastRun' => $last, 'busy' => $busy];
    }

    /**
     * @return array{finished: bool|null, at: string|null, bytes: int|null}
     */
    private static function backup(string $appRoot): array
    {
        $path = $appRoot . '/storage/cache/db-dump-last.json';
        if (!is_file($path)) {
            return ['finished' => null, 'at' => null, 'bytes' => null];
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            return ['finished' => null, 'at' => null, 'bytes' => null];
        }
        $at = $decoded['at'] ?? null;
        $bytes = $decoded['bytes'] ?? null;
        return [
            'finished' => array_key_exists('finished', $decoded) ? (bool) $decoded['finished'] : null,
            'at' => is_string($at) ? $at : null,
            'bytes' => is_int($bytes) ? $bytes : (is_numeric($bytes) ? (int) $bytes : null),
        ];
    }

    /**
     * @return array{bytes: int|null, partial: bool}
     */
    private static function disk(string $appRoot): array
    {
        if (!is_dir($appRoot) || !is_readable($appRoot)) {
            return ['bytes' => null, 'partial' => false];
        }
        $total = 0;
        $seen = 0;
        $partial = false;
        $stop = time() + 2;
        $stack = [$appRoot];
        while ($stack !== []) {
            if (time() >= $stop || $seen > 20000) {
                $partial = true;
                break;
            }
            $dir = array_pop($stack);
            $list = @scandir($dir);
            if ($list === false) {
                $partial = true;
                continue;
            }
            foreach ($list as $name) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                $path = $dir . '/' . $name;
                $seen++;
                if (is_dir($path)) {
                    $stack[] = $path;
                    continue;
                }
                if (is_file($path)) {
                    $size = @filesize($path);
                    if (is_int($size)) {
                        $total += $size;
                    }
                }
            }
        }
        return ['bytes' => $total, 'partial' => $partial];
    }

    private static function errors(PDO $pdo, string $appRoot): int
    {
        $count = 0;
        try {
            $value = $pdo->query(
                'SELECT COUNT(*) FROM error_logs WHERE created_at >= (UTC_TIMESTAMP(3) - INTERVAL 1 DAY)'
            )->fetchColumn();
            $count = is_numeric($value) ? (int) $value : 0;
        } catch (Throwable) {
            $count = 0;
        }
        $dir = $appRoot . '/storage/logs';
        if (!is_dir($dir)) {
            return $count;
        }
        $files = glob($dir . '/app-*.log');
        if ($files === false) {
            return $count;
        }
        rsort($files, SORT_STRING);
        $left = 2;
        foreach ($files as $file) {
            if ($left <= 0) {
                break;
            }
            $left--;
            $fh = @fopen($file, 'rb');
            if ($fh === false) {
                continue;
            }
            $size = filesize($file);
            if (is_int($size) && $size > 262144) {
                fseek($fh, $size - 262144);
                fgets($fh);
            }
            while (($line = fgets($fh)) !== false) {
                if (str_contains($line, '.ERROR:') || str_contains($line, '.CRITICAL:')) {
                    $count++;
                }
            }
            fclose($fh);
        }
        return $count;
    }

    /**
     * @param list<string> $keys
     */
    private static function filled(array $config, array $keys): bool
    {
        foreach ($keys as $key) {
            if (trim((string) ($config[$key] ?? '')) === '') {
                return false;
            }
        }
        return true;
    }

    /**
     * @param list<string> $keys
     */
    private static function anyFilled(array $config, array $keys): bool
    {
        foreach ($keys as $key) {
            if (trim((string) ($config[$key] ?? '')) !== '') {
                return true;
            }
        }
        return false;
    }
}
