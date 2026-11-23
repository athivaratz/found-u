<?php

declare(strict_types=1);

namespace Foundu\Cron;

use Foundu\Database;
use Foundu\Ids;
use PDO;

final class Lock
{
    public function tryAcquire(PDO $pdo, string $name, int $ttlSeconds, int $now): ?string
    {
        if ($name === '' || strlen($name) > 32 || $ttlSeconds < 1) {
            return null;
        }
        $owner = Ids::uuid();
        $until = Ids::utc($now + $ttlSeconds);
        $nowSql = Ids::utc($now);
        // VALUES() is the inserted row. The AS alias form is rejected by a
        // native prepared statement on MariaDB 10.11, so this stays as it is.
        Database::run(
            $pdo,
            'INSERT INTO cron_lock (name, owner, locked_until) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               owner = IF(locked_until <= ?, VALUES(owner), owner),
               locked_until = IF(locked_until <= ?, VALUES(locked_until), locked_until)',
            [$name, $owner, $until, $nowSql, $nowSql]
        );
        $row = Database::run(
            $pdo,
            'SELECT owner FROM cron_lock WHERE name = ?',
            [$name]
        )->fetch();
        if (!is_array($row) || !hash_equals((string) $row['owner'], $owner)) {
            return null;
        }
        return $owner;
    }

    public function release(PDO $pdo, string $name, string $owner): void
    {
        Database::run(
            $pdo,
            'DELETE FROM cron_lock WHERE name = ? AND owner = ?',
            [$name, $owner]
        );
    }
}
