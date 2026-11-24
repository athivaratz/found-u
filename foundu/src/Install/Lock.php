<?php

declare(strict_types=1);

namespace Foundu\Install;

// Installed means both files exist. The env file alone is the manual path
// still in progress. The lock alone is not enough, because a half-written
// install must be able to resume. Together they make /install answer 404.
final class Lock
{
    public static function envPath(string $appRoot): string
    {
        return $appRoot . '/config/.env.php';
    }

    public static function lockPath(string $appRoot): string
    {
        return $appRoot . '/config/install.lock';
    }

    public static function tokenPath(string $appRoot): string
    {
        return $appRoot . '/install-token.txt';
    }

    public static function engaged(string $appRoot): bool
    {
        return is_file(self::envPath($appRoot)) && is_file(self::lockPath($appRoot));
    }

    public static function write(string $appRoot, int $now): bool
    {
        $path = self::lockPath($appRoot);
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return false;
        }
        $body = 'installed ' . gmdate('Y-m-d\TH:i:s\Z', $now) . "\n";
        if (file_put_contents($path, $body, LOCK_EX) === false) {
            return false;
        }
        @chmod($path, 0600);
        return is_file($path);
    }
}
