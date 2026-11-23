<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Database;
use Foundu\Ids;
use Foundu\RateLimit\Buckets;
use Foundu\RateLimit\Decision;
use Foundu\RateLimit\DenyCache;
use Foundu\RateLimit\Limiter;

final class MemoryDenyCache implements DenyCache
{
    public array $until = [];
    public int $lookups = 0;

    public function until(string $key): ?int
    {
        $this->lookups++;
        $value = $this->until[$key] ?? null;
        return is_int($value) ? $value : null;
    }

    public function remember(string $key, int $until): void
    {
        $this->until[$key] = $until;
    }
}

final class RateLimitTest extends DbTestCase
{
    public function testFixedWindowUpsertAndRetryAfter(): void
    {
        $limiter = new Limiter(new MemoryDenyCache());
        $now = 1_700_000_000;
        $allowed = 0;
        $last = null;
        for ($i = 0; $i < 4; $i++) {
            $last = $limiter->hit($this->pdo, 'ip_api', '203.0.113.10', 3, 60, $now);
            if ($last->allowed) {
                $allowed++;
            }
        }
        $this->assertSame(3, $allowed);
        $this->assertInstanceOf(Decision::class, $last);
        $this->assertFalse($last->allowed);
        $this->assertGreaterThan(0, $last->retryAfter);
        $hits = (int) Database::run(
            $this->pdo,
            'SELECT hits FROM rate_limits WHERE scope = ? AND subject = ?',
            ['ip_api', '203.0.113.10']
        )->fetchColumn();
        $this->assertSame(4, $hits);
    }

    public function testSubjectsDoNotShareAWindow(): void
    {
        $limiter = new Limiter(new MemoryDenyCache());
        $now = 1_700_000_100;
        $limiter->hit($this->pdo, 'ip_auth', '203.0.113.11', 1, 60, $now);
        $other = $limiter->hit($this->pdo, 'ip_auth', '203.0.113.12', 1, 60, $now);
        $this->assertTrue($other->allowed);
    }

    public function testDenyCacheSkipsTheDatabase(): void
    {
        $cache = new MemoryDenyCache();
        $limiter = new Limiter($cache);
        $now = 1_700_000_200;
        $limiter->hit($this->pdo, 'ip_api', '203.0.113.13', 1, 60, $now);
        $denied = $limiter->hit($this->pdo, 'ip_api', '203.0.113.13', 1, 60, $now);
        $this->assertFalse($denied->allowed);
        $this->assertNotEmpty($cache->until);

        $this->pdo->exec('DELETE FROM rate_limits');
        $again = $limiter->hit($this->pdo, 'ip_api', '203.0.113.13', 1, 60, $now);
        $this->assertFalse($again->allowed);
        $left = (int) Database::run($this->pdo, 'SELECT COUNT(*) FROM rate_limits', [])->fetchColumn();
        $this->assertSame(0, $left);
    }

    public function testAllowPathStillReadsMariaDbWhenTheCacheIsEmpty(): void
    {
        $cache = new MemoryDenyCache();
        $limiter = new Limiter($cache);
        $now = 1_700_000_300;
        Database::run(
            $this->pdo,
            'INSERT INTO rate_limits (scope, subject, window_start, hits) VALUES (?, ?, ?, ?)',
            ['ip_api', '203.0.113.14', Ids::utc($now - ($now % 60)), 50]
        );
        $decision = $limiter->hit($this->pdo, 'ip_api', '203.0.113.14', 50, 60, $now);
        $this->assertFalse($decision->allowed);
        $this->assertSame(1, $cache->lookups);
    }

    public function testBucketsMatchThePlan(): void
    {
        $config = [];
        $this->assertSame(['ip_api', 120, 60], Buckets::forPath('/health', $config));
        $this->assertSame(['ip_auth', 10, 60], Buckets::forPath('/auth/login', $config));
        $this->assertSame(['account_presign', 20, 3600], Buckets::presign($config));
    }
}
