<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Config;
use Foundu\Database;
use Foundu\Ids;
use PDO;

// Five failures on one account lock it for 15 minutes. Twenty failures from
// one IP lock that IP for an hour. Successes reset the count that follows
// them. The message shown to the visitor stays vague; this only reports
// whether the attempt is allowed and how long to wait.
final class LoginLockout
{
    public function __construct(
        private readonly int $accountLimit,
        private readonly int $accountWindow,
        private readonly int $ipLimit,
        private readonly int $ipWindow,
    ) {
    }

    public static function fromConfig(array $config): self
    {
        return new self(
            Config::int($config, 'LOGIN_LOCK_ACCOUNT_LIMIT', 5, 1, 100),
            Config::int($config, 'LOGIN_LOCK_ACCOUNT_SECONDS', 900, 60, 86400),
            Config::int($config, 'LOGIN_LOCK_IP_LIMIT', 20, 1, 1000),
            Config::int($config, 'LOGIN_LOCK_IP_SECONDS', 3600, 60, 86400),
        );
    }

    public function blocked(PDO $pdo, ?string $studentId, string $ip, int $now): int
    {
        $wait = 0;
        if ($studentId !== null && $studentId !== '') {
            $wait = max($wait, $this->wait($pdo, 'student_id', $studentId, $this->accountLimit, $this->accountWindow, $now));
        }
        if ($ip !== '') {
            $wait = max($wait, $this->wait($pdo, 'ip', $ip, $this->ipLimit, $this->ipWindow, $now));
        }
        return $wait;
    }

    public function record(PDO $pdo, ?string $studentId, ?string $accountId, string $ip, string $kind, bool $succeeded, int $now): void
    {
        if (!in_array($kind, ['password', 'pin', 'passkey'], true)) {
            $kind = 'password';
        }
        Database::run(
            $pdo,
            'INSERT INTO login_attempts (student_id, account_id, ip, kind, succeeded, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
                $studentId,
                $accountId,
                substr($ip, 0, 45),
                $kind,
                $succeeded ? 1 : 0,
                Ids::utc($now),
            ]
        );
    }

    private function wait(PDO $pdo, string $column, string $value, int $limit, int $window, int $now): int
    {
        if ($column !== 'student_id' && $column !== 'ip') {
            return 0;
        }
        $rows = Database::run(
            $pdo,
            "SELECT created_at FROM login_attempts
             WHERE {$column} = ? AND succeeded = 0
               AND created_at > IFNULL((
                    SELECT MAX(created_at) FROM login_attempts WHERE {$column} = ? AND succeeded = 1
               ), '1970-01-01')
             ORDER BY created_at DESC
             LIMIT {$limit}",
            [$value, $value]
        )->fetchAll();
        if (count($rows) < $limit) {
            return 0;
        }
        $oldest = Ids::unix((string) $rows[$limit - 1]['created_at']);
        $until = $oldest + $window;
        return $until > $now ? $until - $now : 0;
    }
}
