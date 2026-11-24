<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Config;
use Foundu\Database;
use Foundu\Ids;
use PDO;

final class QuotaResult
{
    public function __construct(
        public readonly bool $allowed,
        public readonly ?string $reason,
        public readonly int $userRemainingMinute,
        public readonly int $userRemainingHour,
        public readonly int $systemRemainingMinute,
        public readonly int $systemRemainingHour,
        public readonly int $resetMinute,
        public readonly int $resetHour,
    ) {
    }
}

// Counts ai_usage. Defaults match the current app: 5/minute and 30/hour
// for one account, 20/minute and 100/hour for the whole site. P8 and P9
// call allowAndRecord. This class does not talk to Gemini or OpenRouter.
final class Quota
{
    private const LOCK = 'foundu_ai_quota';

    public function __construct(
        private readonly int $userMinute,
        private readonly int $userHour,
        private readonly int $systemMinute,
        private readonly int $systemHour,
    ) {
    }

    public static function fromConfig(array $config): self
    {
        return new self(
            Config::int($config, 'AI_QUOTA_PER_MINUTE', 5, 1, 10000),
            Config::int($config, 'AI_QUOTA_PER_HOUR', 30, 1, 100000),
            Config::int($config, 'AI_SYSTEM_QUOTA_PER_MINUTE', 20, 1, 100000),
            Config::int($config, 'AI_SYSTEM_QUOTA_PER_HOUR', 100, 1, 1000000),
        );
    }

    public function check(PDO $pdo, string $userId, int $now): QuotaResult
    {
        $minute = Ids::utc($now - 60);
        $hour = Ids::utc($now - 3600);
        $row = Database::run(
            $pdo,
            'SELECT
                COALESCE(SUM(CASE WHEN user_id = ? AND created_at >= ? THEN 1 ELSE 0 END), 0) AS user_minute,
                COALESCE(SUM(CASE WHEN user_id = ? AND created_at >= ? THEN 1 ELSE 0 END), 0) AS user_hour,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS system_minute,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS system_hour,
                MIN(CASE WHEN user_id = ? AND created_at >= ? THEN created_at END) AS oldest_minute,
                MIN(CASE WHEN user_id = ? AND created_at >= ? THEN created_at END) AS oldest_hour
             FROM ai_usage
             WHERE created_at >= ?',
            [
                $userId, $minute,
                $userId, $hour,
                $minute,
                $hour,
                $userId, $minute,
                $userId, $hour,
                $hour,
            ]
        )->fetch();
        $userMinute = (int) ($row['user_minute'] ?? 0);
        $userHour = (int) ($row['user_hour'] ?? 0);
        $systemMinute = (int) ($row['system_minute'] ?? 0);
        $systemHour = (int) ($row['system_hour'] ?? 0);

        $reason = null;
        if ($userMinute >= $this->userMinute) {
            $reason = 'user_minute';
        } elseif ($userHour >= $this->userHour) {
            $reason = 'user_hour';
        } elseif ($systemMinute >= $this->systemMinute) {
            $reason = 'system_minute';
        } elseif ($systemHour >= $this->systemHour) {
            $reason = 'system_hour';
        }

        $oldestMinute = is_string($row['oldest_minute'] ?? null) ? Ids::unix($row['oldest_minute']) : 0;
        $oldestHour = is_string($row['oldest_hour'] ?? null) ? Ids::unix($row['oldest_hour']) : 0;

        return new QuotaResult(
            $reason === null,
            $reason,
            max(0, $this->userMinute - $userMinute),
            max(0, $this->userHour - $userHour),
            max(0, $this->systemMinute - $systemMinute),
            max(0, $this->systemHour - $systemHour),
            $oldestMinute > 0 ? $oldestMinute + 60 : $now + 60,
            $oldestHour > 0 ? $oldestHour + 3600 : $now + 3600,
        );
    }

    public function record(PDO $pdo, string $userId, string $endpoint, int $now): void
    {
        if (preg_match('/^[a-z0-9_-]{1,32}$/', $endpoint) !== 1) {
            $endpoint = 'other';
        }
        Database::run(
            $pdo,
            'INSERT INTO ai_usage (id, user_id, endpoint, created_at) VALUES (?, ?, ?, ?)',
            [Ids::uuid(), $userId, $endpoint, Ids::utc($now)]
        );
    }

    public function allowAndRecord(PDO $pdo, string $userId, string $endpoint, int $now): QuotaResult
    {
        $got = Database::run($pdo, 'SELECT GET_LOCK(?, 1)', [self::LOCK])->fetchColumn();
        if ((string) $got !== '1') {
            $denied = $this->check($pdo, $userId, $now);
            return new QuotaResult(
                false,
                'busy',
                $denied->userRemainingMinute,
                $denied->userRemainingHour,
                $denied->systemRemainingMinute,
                $denied->systemRemainingHour,
                $denied->resetMinute,
                $denied->resetHour,
            );
        }
        try {
            $result = $this->check($pdo, $userId, $now);
            if ($result->allowed) {
                $this->record($pdo, $userId, $endpoint, $now);
                return new QuotaResult(
                    true,
                    null,
                    max(0, $result->userRemainingMinute - 1),
                    max(0, $result->userRemainingHour - 1),
                    max(0, $result->systemRemainingMinute - 1),
                    max(0, $result->systemRemainingHour - 1),
                    $result->resetMinute,
                    $result->resetHour,
                );
            }
            return $result;
        } finally {
            Database::run($pdo, 'SELECT RELEASE_LOCK(?)', [self::LOCK]);
        }
    }
}
