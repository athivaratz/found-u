<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

use Foundu\Database;
use Foundu\Ids;
use PDO;

// Fixed window, one upsert. hits may climb past the limit; the decision is
// whether this request's count is still inside it. APCu only skips MariaDB
// after MariaDB has already said no for this window.
final class Limiter
{
    public function __construct(private readonly DenyCache $denies)
    {
    }

    public static function open(): self
    {
        return new self(ApcuDenyCache::fromEnvironment());
    }

    public function hit(PDO $pdo, string $scope, string $subject, int $limit, int $windowSeconds, int $now): Decision
    {
        if ($scope === '' || strlen($scope) > 64 || $subject === '' || strlen($subject) > 128) {
            return new Decision(false, $limit + 1, $limit, $windowSeconds);
        }
        if ($limit < 1 || $windowSeconds < 1) {
            return new Decision(false, 1, 1, 1);
        }

        $windowStart = $now - ($now % $windowSeconds);
        $key = $scope . "\n" . $subject . "\n" . $windowStart;
        $cached = $this->denies->until($key);
        $retry = $windowSeconds - ($now - $windowStart);
        if ($retry < 1) {
            $retry = 1;
        }
        if ($cached !== null && $cached > $now) {
            return new Decision(false, $limit + 1, $limit, $cached - $now);
        }

        $sql = 'INSERT INTO rate_limits (scope, subject, window_start, hits)
            VALUES (?, ?, ?, LAST_INSERT_ID(1))
            ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(LEAST(hits + 1, 1000000000))';
        Database::run($pdo, $sql, [$scope, $subject, Ids::utc($windowStart)]);
        $hits = (int) $pdo->lastInsertId();
        if ($hits < 1) {
            $hits = 1;
        }
        if ($hits > $limit) {
            $this->denies->remember($key, $now + $retry);
            return new Decision(false, $hits, $limit, $retry);
        }
        return new Decision(true, $hits, $limit, $retry);
    }
}
