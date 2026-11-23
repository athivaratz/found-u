<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Ai\Quota;
use Foundu\Ai\Semaphore;
use Foundu\Database;
use Foundu\Ids;

final class SemaphoreTest extends DbTestCase
{
    public function testLeaseCountAndExpiry(): void
    {
        $now = 1_700_000_000;
        $slots = new Semaphore();
        $first = $slots->acquire($this->pdo, null, 2, 30, $now);
        $second = $slots->acquire($this->pdo, null, 2, 30, $now);
        $third = $slots->acquire($this->pdo, null, 2, 30, $now);
        $this->assertNotNull($first);
        $this->assertNotNull($second);
        $this->assertNull($third);
        $this->assertSame(Semaphore::FULL_MESSAGE, 'คิว AI เต็ม ลองใหม่อีกสักครู่');

        $slots->release($this->pdo, (string) $first);
        $again = $slots->acquire($this->pdo, null, 2, 30, $now);
        $this->assertNotNull($again);

        Database::run($this->pdo, 'UPDATE ai_slots SET expires_at = ?', [Ids::utc($now - 5)]);
        $afterExpiry = $slots->acquire($this->pdo, null, 1, 30, $now);
        $this->assertNotNull($afterExpiry);
        $live = (int) Database::run(
            $this->pdo,
            'SELECT COUNT(*) FROM ai_slots WHERE expires_at > ?',
            [Ids::utc($now)]
        )->fetchColumn();
        $this->assertSame(1, $live);
    }

    public function testQuotaStopsAtTheMinuteLimit(): void
    {
        $account = $this->account('user', '10004');
        $quota = new Quota(2, 30, 20, 100);
        $now = 1_700_000_000;
        $this->assertTrue($quota->allowAndRecord($this->pdo, $account, 'ner', $now)->allowed);
        $this->assertTrue($quota->allowAndRecord($this->pdo, $account, 'ner', $now)->allowed);
        $blocked = $quota->allowAndRecord($this->pdo, $account, 'ner', $now);
        $this->assertFalse($blocked->allowed);
        $this->assertSame('user_minute', $blocked->reason);
        $count = (int) Database::run(
            $this->pdo,
            'SELECT COUNT(*) FROM ai_usage WHERE user_id = ?',
            [$account]
        )->fetchColumn();
        $this->assertSame(2, $count);
    }
}
