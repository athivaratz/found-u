<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Cron\Cleanup;
use Foundu\Cron\Lock;
use Foundu\Database;
use Foundu\Ids;

final class CronLockTest extends DbTestCase
{
    public function testSecondRunnerExitsWithoutWaiting(): void
    {
        $other = Database::connect($this->config());
        $lock = new Lock();
        $now = 1_700_000_000;
        $owner = $lock->tryAcquire($this->pdo, 'cron', 60, $now);
        $this->assertNotNull($owner);
        $this->assertNull($lock->tryAcquire($other, 'cron', 60, $now + 1));

        $lock->release($this->pdo, 'cron', (string) $owner);
        $next = $lock->tryAcquire($other, 'cron', 60, $now + 2);
        $this->assertNotNull($next);
        $lock->release($other, 'cron', (string) $next);
    }

    public function testExpiredLockCanBeTaken(): void
    {
        $other = Database::connect($this->config());
        $lock = new Lock();
        $now = 1_700_000_000;
        $owner = $lock->tryAcquire($this->pdo, 'cron', 30, $now);
        $this->assertNotNull($owner);
        $this->assertNull($lock->tryAcquire($other, 'cron', 30, $now + 29));
        $taken = $lock->tryAcquire($other, 'cron', 30, $now + 31);
        $this->assertNotNull($taken);
        $this->assertNotSame($owner, $taken);
    }

    public function testCleanupDropsExpiredRowsOnly(): void
    {
        $account = $this->account('user', '10005');
        $now = 1_700_000_000;
        Database::run(
            $this->pdo,
            'INSERT INTO sessions (id, token_hash, account_id, kind, csrf_token, created_at, expires_at)
             VALUES (?, ?, ?, \'browser\', ?, ?, ?)',
            [Ids::uuid(), str_repeat('a', 64), $account, str_repeat('b', 64), Ids::utc($now - 100), Ids::utc($now - 10)]
        );
        $live = Ids::uuid();
        Database::run(
            $this->pdo,
            'INSERT INTO sessions (id, token_hash, account_id, kind, csrf_token, created_at, expires_at)
             VALUES (?, ?, ?, \'browser\', ?, ?, ?)',
            [$live, str_repeat('c', 64), $account, str_repeat('d', 64), Ids::utc($now), Ids::utc($now + 600)]
        );
        Database::run(
            $this->pdo,
            'INSERT INTO rate_limits (scope, subject, window_start, hits) VALUES (?, ?, ?, 1)',
            ['ip_api', '203.0.113.40', Ids::utc($now - 200000)]
        );
        $counts = Cleanup::run($this->pdo, $now, 43200);
        $this->assertGreaterThanOrEqual(1, $counts['sessions']);
        $left = Database::run($this->pdo, 'SELECT id FROM sessions', [])->fetchAll();
        $this->assertCount(1, $left);
        $this->assertSame($live, $left[0]['id']);
        $oldWindow = (int) Database::run(
            $this->pdo,
            'SELECT COUNT(*) FROM rate_limits WHERE subject = ?',
            ['203.0.113.40']
        )->fetchColumn();
        $this->assertSame(0, $oldWindow);
    }

    public function testCronScriptExitsWhileTheLockIsHeld(): void
    {
        $lock = new Lock();
        $owner = $lock->tryAcquire($this->pdo, 'cron', 120, time());
        $this->assertNotNull($owner);

        $busy = $this->cron();
        $this->assertSame(0, $busy['code']);
        $this->assertStringContainsString('cron busy', $busy['out']);

        $lock->release($this->pdo, 'cron', (string) $owner);
        $ran = $this->cron();
        $this->assertSame(0, $ran['code'], $ran['err']);
        $this->assertStringContainsString('sessions ', $ran['out']);
        $this->assertStringContainsString('expired ', $ran['out']);
        $this->assertStringContainsString('cf-ips skipped', $ran['out']);
        $this->assertStringContainsString('dump skipped', $ran['out']);
    }

    private function cron(): array
    {
        $stamp = dirname(__DIR__) . '/storage/cache/cf-ips-refreshed';
        if (!is_dir(dirname($stamp))) {
            mkdir(dirname($stamp), 0775, true);
        }
        file_put_contents($stamp, (string) time());
        $pipes = [];
        $proc = proc_open(
            [PHP_BINARY, dirname(__DIR__) . '/bin/cron.php'],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            dirname(__DIR__)
        );
        $this->assertIsResource($proc);
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        return ['code' => proc_close($proc), 'out' => (string) $out, 'err' => (string) $err];
    }
}
