<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use PHPUnit\Framework\TestCase;

final class AuthzTest extends TestCase
{
    public function testRolesFollowTheMatrix(): void
    {
        $guest = Actor::guest();
        $me = '11111111-1111-4111-8111-111111111111';
        $other = '22222222-2222-4222-8222-222222222222';
        $user = new Actor(Actor::USER, $me, '10001', true);
        $admin = new Actor(Actor::ADMIN, $other, '11111', true);

        $this->assertFalse(Authz::permits('accounts', 'select', $guest, ['id' => $me]));
        $this->assertTrue(Authz::permits('accounts', 'select', $user, ['id' => $me, 'linked_uid' => $me]));
        $this->assertFalse(Authz::permits('accounts', 'select', $user, ['id' => $other, 'linked_uid' => $other]));
        $this->assertTrue(Authz::permits('accounts', 'select', $admin, ['id' => $me]));
        $this->assertFalse(Authz::permits('accounts', 'delete', $admin, ['id' => $me]));
        $this->assertFalse(Authz::permits('accounts', 'update', $user, ['id' => $other]));

        $this->assertTrue(Authz::permits('lost_items', 'select', $guest));
        $this->assertTrue(Authz::permits('lost_items', 'insert', $user, ['user_id' => $me]));
        $this->assertFalse(Authz::permits('lost_items', 'insert', $user, ['user_id' => $other]));
        $this->assertFalse(Authz::permits('lost_items', 'update', $user, ['user_id' => $me]));
        $this->assertTrue(Authz::permits('lost_items', 'update', $admin, ['user_id' => $me]));

        $this->assertFalse(Authz::permits('sessions', 'select', $admin));
        $this->assertFalse(Authz::permits('ai_credentials', 'select', $admin));
        $this->assertFalse(Authz::permits('ai_usage', 'insert', $admin, ['user_id' => $me]));
        $this->assertTrue(Authz::permits('ai_usage', 'insert', $user, ['user_id' => $me]));
        $this->assertFalse(Authz::permits('articles', 'select', $guest, ['status' => 'draft']));
        $this->assertTrue(Authz::permits('articles', 'select', $guest, ['status' => 'published']));

        $this->assertTrue($guest->isGuest());
        $this->assertTrue($admin->atLeast(Actor::USER));
        $this->assertFalse($user->atLeast(Actor::ADMIN));
    }
}
