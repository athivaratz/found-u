<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\LoginLockout;

final class LoginLockoutTest extends DbTestCase
{
    public function testFiveAccountFailuresLockAndASuccessClearsThem(): void
    {
        $lock = new LoginLockout(5, 900, 20, 3600);
        $now = 1_700_000_000;
        $this->assertSame(0, $lock->blocked($this->pdo, '10008', '203.0.113.70', $now));
        for ($i = 0; $i < 5; $i++) {
            $lock->record($this->pdo, '10008', null, '203.0.113.70', 'pin', false, $now + $i);
        }
        $wait = $lock->blocked($this->pdo, '10008', '203.0.113.71', $now + 5);
        $this->assertGreaterThan(800, $wait);

        $lock->record($this->pdo, '10008', null, '203.0.113.70', 'pin', true, $now + 6);
        $this->assertSame(0, $lock->blocked($this->pdo, '10008', '203.0.113.71', $now + 7));
    }
}
