<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Config;
use Foundu\Database;
use Foundu\Ids;
use PDO;

// In-flight AI calls. Expired leases are deleted before the count, inside
// GET_LOCK so two requests cannot both see a free slot. P9 calls this and,
// when it gets null, answers 429 with FULL_MESSAGE. Nothing here calls a model.
final class Semaphore
{
    public const FULL_MESSAGE = 'คิว AI เต็ม ลองใหม่อีกสักครู่';
    private const LOCK = 'foundu_ai_slots';

    public function acquire(PDO $pdo, ?string $accountId, int $max, int $leaseSeconds, int $now): ?string
    {
        $max = max(1, $max);
        $leaseSeconds = max(5, $leaseSeconds);
        if (!$this->lock($pdo)) {
            return null;
        }
        try {
            Database::run($pdo, 'DELETE FROM ai_slots WHERE expires_at <= ?', [Ids::utc($now)]);
            $live = (int) Database::run($pdo, 'SELECT COUNT(*) FROM ai_slots', [])->fetchColumn();
            if ($live >= $max) {
                return null;
            }
            $token = Ids::uuid();
            Database::run(
                $pdo,
                'INSERT INTO ai_slots (account_id, token, acquired_at, expires_at) VALUES (?, ?, ?, ?)',
                [$accountId, $token, Ids::utc($now), Ids::utc($now + $leaseSeconds)]
            );
            return $token;
        } finally {
            $this->unlock($pdo);
        }
    }

    public function release(PDO $pdo, string $token): void
    {
        if ($token === '') {
            return;
        }
        Database::run($pdo, 'DELETE FROM ai_slots WHERE token = ?', [$token]);
    }

    public static function maxFrom(array $config): int
    {
        return Config::int($config, 'AI_MAX_CONCURRENCY', 3, 1, 20);
    }

    public static function leaseFrom(array $config): int
    {
        return Config::int($config, 'AI_SLOT_LEASE_SECONDS', 60, 5, 120);
    }

    private function lock(PDO $pdo): bool
    {
        $got = Database::run($pdo, 'SELECT GET_LOCK(?, 0)', [self::LOCK])->fetchColumn();
        return (string) $got === '1';
    }

    private function unlock(PDO $pdo): void
    {
        Database::run($pdo, 'SELECT RELEASE_LOCK(?)', [self::LOCK]);
    }
}
