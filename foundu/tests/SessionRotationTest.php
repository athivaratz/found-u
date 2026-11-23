<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\SessionService;
use Foundu\Database;
use Foundu\Http\SetCookie;

final class SessionRotationTest extends DbTestCase
{
    public function testRotateReplacesTheTokenAndKeepsTheRow(): void
    {
        $account = $this->account();
        $sessions = new SessionService(1800, 43200);
        $now = 1_700_000_000;
        $issued = $sessions->issue($this->pdo, $account, true, $now, '203.0.113.20', 'phpunit');

        $this->assertStringStartsWith('__Host-foundu=', $issued->cookies[0]);
        $this->assertStringContainsString('HttpOnly', $issued->cookies[0]);
        $this->assertStringContainsString('Secure', $issued->cookies[0]);
        $this->assertStringContainsString('SameSite=Lax', $issued->cookies[0]);
        $this->assertStringNotContainsString('Domain=', $issued->cookies[0]);
        $this->assertStringStartsWith('__Host-foundu-csrf=', $issued->cookies[1]);
        $this->assertStringNotContainsString('HttpOnly', $issued->cookies[1]);

        $open = $sessions->open($this->pdo, $issued->token, $now);
        $this->assertNotNull($open);
        $this->assertSame($issued->record->id, $open->id);

        $rotated = $sessions->rotate($this->pdo, $issued->record->id, true, $now + 10);
        $this->assertSame($issued->record->id, $rotated->record->id);
        $this->assertNotSame($issued->token, $rotated->token);
        $this->assertNotSame($issued->record->csrf, $rotated->record->csrf);
        $this->assertNull($sessions->open($this->pdo, $issued->token, $now + 10));
        $again = $sessions->open($this->pdo, $rotated->token, $now + 10);
        $this->assertNotNull($again);
        $this->assertSame($rotated->record->csrf, $again->csrf);

        $created = Database::run(
            $this->pdo,
            'SELECT created_at FROM sessions WHERE id = ?',
            [$issued->record->id]
        )->fetchColumn();
        $this->assertSame($now, \Foundu\Ids::unix((string) $created));
    }

    public function testIdleAndAbsoluteExpiry(): void
    {
        $account = $this->account('user', '10002');
        $sessions = new SessionService(100, 500);
        $now = 1_700_000_000;
        $issued = $sessions->issue($this->pdo, $account, false, $now, null, null);
        $this->assertStringStartsWith('foundu=', $issued->cookies[0]);
        $this->assertStringNotContainsString('Secure', $issued->cookies[0]);
        $this->assertStringNotContainsString('__Host-', $issued->cookies[0]);

        $this->assertNull($sessions->open($this->pdo, $issued->token, $now + 101));

        $fresh = $sessions->issue($this->pdo, $account, false, $now, null, null);
        $this->assertNotNull($sessions->open($this->pdo, $fresh->token, $now + 80));
        $this->assertNotNull($sessions->open($this->pdo, $fresh->token, $now + 170));
        $this->assertNull($sessions->open($this->pdo, $fresh->token, $now + 500));
    }

    public function testCookieNames(): void
    {
        $this->assertSame('__Host-foundu', SetCookie::sessionName(true));
        $this->assertSame('foundu', SetCookie::sessionName(false));
    }
}
