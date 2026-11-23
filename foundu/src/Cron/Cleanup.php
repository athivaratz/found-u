<?php

declare(strict_types=1);

namespace Foundu\Cron;

use Foundu\Database;
use Foundu\Ids;
use PDO;

// Rows the security layer creates. Item expiry, chat logs, the Cloudflare
// IP list, and the database dump run from bin/cron.php after this class.
final class Cleanup
{
    public static function run(PDO $pdo, int $now, int $sessionAbsoluteSeconds): array
    {
        return [
            'sessions' => self::sessions($pdo, $now, $sessionAbsoluteSeconds),
            'rate_limits' => self::rateLimits($pdo, $now),
            'login_attempts' => self::loginAttempts($pdo, $now),
            'ai_slots' => self::slots($pdo, $now),
            'ai_usage' => self::usage($pdo, $now),
        ];
    }

    public static function sessions(PDO $pdo, int $now, int $absoluteSeconds): int
    {
        $revokedBefore = Ids::utc($now - 86400);
        $absoluteBefore = Ids::utc($now - max(60, $absoluteSeconds));
        $statement = Database::run(
            $pdo,
            'DELETE FROM sessions
             WHERE expires_at < ? OR created_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)',
            [Ids::utc($now), $absoluteBefore, $revokedBefore]
        );
        return $statement->rowCount();
    }

    public static function rateLimits(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM rate_limits WHERE window_start < ?',
            [Ids::utc($now - 172800)]
        )->rowCount();
    }

    public static function loginAttempts(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM login_attempts WHERE created_at < ?',
            [Ids::utc($now - 172800)]
        )->rowCount();
    }

    public static function slots(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM ai_slots WHERE expires_at <= ?',
            [Ids::utc($now)]
        )->rowCount();
    }

    public static function usage(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM ai_usage WHERE created_at < ? ORDER BY created_at ASC LIMIT 500',
            [Ids::utc($now - 7200)]
        )->rowCount();
    }
}
