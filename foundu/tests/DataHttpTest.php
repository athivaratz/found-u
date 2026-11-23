<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\PasswordHash;
use Foundu\Data\Feed;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Kernel;
use PDO;
use RuntimeException;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class DataHttpTest extends DbTestCase
{
    private App $app;

    private int $ip = 10;

    protected function setUp(): void
    {
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        parent::setUp();
        foreach ([
            'match_dismissals',
            'lost_items',
            'found_items',
            'categories',
            'locations',
            'contact_types',
            'drop_off_locations',
            'app_settings',
        ] as $table) {
            $this->pdo->exec('DELETE FROM ' . $table);
        }
        $this->app = Kernel::create(dirname(__DIR__));
    }

    public function testLostItemsOwnerAdminAndFeed(): void
    {
        $ownerId = $this->student('20001');
        $otherId = $this->student('20002');
        $adminId = $this->student('20003', 'admin');
        $owner = $this->login('20001');
        $other = $this->login('20002');
        $admin = $this->login('20003');

        $this->assertSame(401, $this->post('/lost-items', $this->lostBody())['status']);
        $this->assertSame(403, $this->post('/lost-items', $this->lostBody('found'), $owner)['status']);
        $this->assertSame(403, $this->post('/lost-items', $this->lostBody('searching', $otherId), $owner)['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'lost_items'");
        $created = $this->post('/lost-items', $this->lostBody(), $owner);
        $this->assertSame(201, $created['status']);
        $this->assertSame($ownerId, $created['body']['item']['userId']);
        $this->assertSame('searching', $created['body']['item']['status']);
        $this->assertStringStartsWith('LOST-', $created['body']['item']['trackingCode']);
        $id = $created['body']['id'];
        $stamp = $this->stamp('lost_items');
        $this->assertGreaterThan('2000-01-02', $stamp);

        $guest = $this->get('/lost-items/' . $id);
        $this->assertSame(200, $guest['status']);
        $this->assertSame('private, no-store', $this->header($guest, 'Cache-Control'));
        $this->assertSame($id, $guest['body']['item']['id']);

        $this->assertSame(403, $this->call('PATCH', '/lost-items/' . $id, ['status' => 'found'], $owner)['status']);
        $this->assertSame(403, $this->call('PATCH', '/lost-items/' . $id, ['status' => 'found'], $other)['status']);
        $this->assertSame(401, $this->call('DELETE', '/lost-items/' . $id, null)['status']);

        $patched = $this->call('PATCH', '/lost-items/' . $id, ['status' => 'claimed'], $admin);
        $this->assertSame(200, $patched['status']);
        $this->assertSame('claimed', $patched['body']['item']['status']);
        $this->assertSame(200, $this->call('DELETE', '/lost-items/' . $id, null, $admin)['status']);
        $this->assertSame(404, $this->get('/lost-items/' . $id)['status']);

        $this->assertSame(400, $this->get('/lost-items?limit=101')['status']);
        $this->assertSame('limit', $this->get('/lost-items?limit=101')['body']['field']);
        $this->assertSame(400, $this->get('/lost-items?offset=101')['status']);

        $ids = [];
        for ($i = 0; $i < 3; $i++) {
            $ids[] = $this->post('/lost-items', $this->lostBody(), $owner)['body']['id'];
        }
        $page = $this->get('/lost-items?limit=2');
        $this->assertCount(2, $page['body']['items']);
        $this->assertNotSame('', (string) $page['body']['nextCursor']);
        $rest = $this->get('/lost-items?limit=2&cursor=' . rawurlencode((string) $page['body']['nextCursor']));
        $seen = [];
        foreach (array_merge($page['body']['items'], $rest['body']['items']) as $item) {
            $seen[$item['id']] = true;
        }
        $this->assertSame([], array_diff($ids, array_keys($seen)));
        $this->assertCount(3, $seen);

        Database::privileged($this->pdo, function (PDO $pdo) use ($adminId): void {
            Database::run($pdo, 'UPDATE accounts SET ban_status = \'banned\', ban_reason = \'ทดสอบ\' WHERE id = ?', [$adminId]);
        });
        $this->pdo->exec('UPDATE sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE account_id = ' . $this->pdo->quote($adminId));
        $banned = $this->post('/lost-items', $this->lostBody(), $admin);
        $this->assertSame(401, $banned['status']);
    }

    public function testFoundHandoverExpireAndDismissals(): void
    {
        $this->student('20011');
        $this->student('20012', 'admin');
        $user = $this->login('20011');
        $admin = $this->login('20012');

        $this->assertSame(403, $this->post('/found-items', $this->foundBody('found'), $user)['status']);
        $created = $this->post('/found-items', $this->foundBody(), $user);
        $this->assertSame(201, $created['status']);
        $this->assertSame('pending_room_confirm', $created['body']['item']['status']);
        $this->assertNotNull($created['body']['item']['handoverDeadlineAt']);
        $id = $created['body']['id'];

        $this->assertSame(401, $this->post('/found-items/' . $id . '/handover', [])['status']);
        $this->assertSame(403, $this->post('/found-items/' . $id . '/handover', [], $user)['status']);
        $handed = $this->post('/found-items/' . $id . '/handover', [], $admin);
        $this->assertSame(200, $handed['status']);
        $this->assertSame('found', $handed['body']['item']['status']);
        $this->assertTrue($handed['body']['item']['roomHandoverConfirmed']);

        $pending = $this->post('/found-items', $this->foundBody(), $user);
        $pendingId = $pending['body']['id'];
        Database::run(
            $this->pdo,
            'UPDATE found_items SET handover_deadline_at = ? WHERE id = ?',
            ['2000-01-01 00:00:00.000', $pendingId]
        );
        $expired = $this->post('/found/expire-overdue', []);
        $this->assertSame(200, $expired['status']);
        $this->assertSame(1, $expired['body']['expired']);
        $row = $this->get('/found-items/' . $pendingId);
        $this->assertSame('expired', $row['body']['item']['status']);
        $this->assertSame(0, $this->post('/found/expire-overdue', [])['body']['expired']);

        $lost = $this->post('/lost-items', $this->lostBody(), $user);
        $this->assertSame(401, $this->post('/match-dismissals', ['lostId' => $lost['body']['id'], 'foundId' => $id])['status']);
        $this->assertSame(403, $this->post('/match-dismissals', ['lostId' => $lost['body']['id'], 'foundId' => $id], $user)['status']);
        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'match_dismissals'");
        $dismissed = $this->post('/match-dismissals', ['lostId' => $lost['body']['id'], 'foundId' => $id], $admin);
        $this->assertSame(201, $dismissed['status']);
        $again = $this->post('/match-dismissals', ['lostId' => $lost['body']['id'], 'foundId' => $id], $admin);
        $this->assertSame(200, $again['status']);
        $this->assertSame($dismissed['body']['dismissal']['id'], $again['body']['dismissal']['id']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('match_dismissals'));
        $this->assertSame(403, $this->get('/match-dismissals', $user)['status']);
        $this->assertSame(200, $this->call('DELETE', '/match-dismissals/' . $dismissed['body']['id'], null, $admin)['status']);

        $stats = $this->get('/stats');
        $this->assertSame(200, $stats['status']);
        $this->assertArrayHasKey('searching', $stats['body']);
        $this->assertArrayHasKey('pendingRoomConfirm', $stats['body']);
        $this->assertStringContainsString('s-maxage=60', $this->header($stats, 'Cache-Control'));
        $this->assertSame(200, $this->post('/revalidate-og', [])['status']);
        $this->assertTrue($this->post('/revalidate-og', [])['body']['revalidated']);
    }

    public function testCatalogAndSettingsCache(): void
    {
        $this->student('20021');
        $this->student('20022', 'admin');
        $user = $this->login('20021');
        $admin = $this->login('20022');

        foreach ([
            '/categories' => ['value' => 'badge', 'label' => 'ป้ายชื่อ', 'icon' => '🏷️', 'order' => 3],
            '/locations' => ['value' => 'lab', 'label' => 'ห้องแล็บ', 'order' => 4],
            '/contact-types' => ['value' => 'line', 'label' => 'ไลน์', 'icon' => '💬', 'placeholder' => '@id', 'order' => 2],
            '/drop-off-locations' => ['value' => 'gate', 'label' => 'ประตู', 'order' => 5],
        ] as $path => $body) {
            $list = $this->get($path);
            $this->assertSame(200, $list['status'], $path);
            $this->assertStringContainsString('public, s-maxage=60', $this->header($list, 'Cache-Control'));
            $etag = $this->header($list, 'ETag');
            $this->assertNotSame('', $etag);
            $cached = $this->call('GET', $path, null, [], true, null, ['If-None-Match' => $etag]);
            $this->assertSame(304, $cached['status'], $path);
            $this->assertSame('', $cached['raw']);
            $this->assertSame(401, $this->post($path, $body)['status'], $path);
            $this->assertSame(403, $this->post($path, $body, $user)['status'], $path);
            $made = $this->post($path, $body, $admin);
            $this->assertSame(201, $made['status'], $path);
            $this->assertSame(403, $this->call('DELETE', $path . '/' . $made['body']['id'], null, $user)['status'], $path);
        }

        $public = $this->get('/public-settings');
        $this->assertSame(200, $public['status']);
        $this->assertSame(['comingSoonEnabled', 'comingSoonMessage'], array_keys($public['body']));
        $this->assertFalse($public['body']['comingSoonEnabled']);
        $this->assertSame('พบกันเร็วๆนี้', $public['body']['comingSoonMessage']);
        $this->assertStringContainsString('s-maxage=60', $this->header($public, 'Cache-Control'));

        $full = $this->get('/settings');
        $this->assertSame(200, $full['status']);
        $this->assertArrayHasKey('settings', $full['body']);
        $this->assertNull($full['body']['loadError']);
        $this->assertSame(401, $this->call('PATCH', '/admin/settings', ['comingSoonEnabled' => true])['status']);
        $this->assertSame(403, $this->call('PATCH', '/admin/settings', ['comingSoonEnabled' => true], $user)['status']);
        $this->assertSame(400, $this->call('PATCH', '/admin/settings', ['geminiApiKey' => 'secret'], $admin)['status']);
        $saved = $this->call('PATCH', '/admin/settings', [
            'comingSoonEnabled' => true,
            'comingSoonMessage' => 'ปิดปรับปรุง',
        ], $admin);
        $this->assertSame(200, $saved['status']);
        $this->assertTrue($saved['body']['settings']['comingSoonEnabled']);
        $after = $this->get('/public-settings');
        $this->assertTrue($after['body']['comingSoonEnabled']);
        $this->assertSame('ปิดปรับปรุง', $after['body']['comingSoonMessage']);
        $this->assertGreaterThan('2000-01-01', $this->stamp('app_settings'));

        $probe = dirname(__DIR__, 2) . '/public/img/foundu-p5-probe.png';
        $dir = dirname($probe);
        $wrote = is_dir($dir) || @mkdir($dir, 0775, true);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', true);
        $wrote = $wrote && is_string($png) && file_put_contents($probe, $png) !== false;
        try {
            $images = $this->get('/public-images?folder=img');
            $this->assertSame(200, $images['status']);
            $this->assertIsArray($images['body']['images']);
            $this->assertStringContainsString('s-maxage=60', $this->header($images, 'Cache-Control'));
            $evil = $this->get('/public-images?folder=../../etc');
            $this->assertSame($images['body'], $evil['body']);
            if ($wrote) {
                $hit = null;
                foreach ($images['body']['images'] as $image) {
                    if (($image['fileName'] ?? '') === 'foundu-p5-probe.png') {
                        $hit = $image;
                    }
                    $this->assertStringNotContainsString('..', (string) ($image['url'] ?? ''));
                }
                $this->assertIsArray($hit);
                $this->assertSame(1, $hit['width']);
                $this->assertSame(1, $hit['height']);
                $this->assertSame('/img/foundu-p5-probe.png', $hit['url']);
            }
        } finally {
            if ($wrote && is_file($probe)) {
                unlink($probe);
            }
        }
    }

    public function testUsersBanRoleAndProfile(): void
    {
        $userId = $this->student('20031');
        $otherId = $this->student('20032');
        $adminId = $this->student('20033', 'admin');
        $user = $this->login('20031');
        $other = $this->login('20032');
        $admin = $this->login('20033');

        $this->assertSame(401, $this->get('/admin/users')['status']);
        $this->assertSame(403, $this->get('/admin/users', $user)['status']);
        $list = $this->get('/admin/users', $admin);
        $this->assertSame(200, $list['status']);
        $this->assertGreaterThanOrEqual(3, count($list['body']['users']));
        $this->assertSame('private, no-store', $this->header($list, 'Cache-Control'));

        $this->assertSame(401, $this->get('/users/' . $userId)['status']);
        $this->assertSame(404, $this->get('/users/' . $otherId, $user)['status']);
        $self = $this->get('/users/me', $user);
        $this->assertSame(200, $self['status']);
        $this->assertSame($userId, $self['body']['user']['uid']);
        $this->assertArrayNotHasKey('pin_hash', $self['body']['user']);
        $this->assertSame(200, $this->get('/users/' . $userId, $admin)['status']);

        $profile = $this->call('PATCH', '/user/profile', ['shownName' => 'สมชาย'], $user);
        $this->assertSame(200, $profile['status']);
        $this->assertSame('สมชาย', $profile['body']['shownName']);
        $this->assertSame(401, $this->call('PATCH', '/user/profile', ['shownName' => 'x'])['status']);
        $this->assertSame('Unauthorized', $this->call('PATCH', '/user/profile', ['shownName' => 'x'])['body']['error']);
        $this->assertSame(400, $this->call('PATCH', '/users/me', ['role' => 'admin'], $user)['status']);
        $role = Database::run($this->pdo, 'SELECT role FROM accounts WHERE id = ?', [$userId])->fetchColumn();
        $this->assertSame('user', $role);

        $renamed = $this->call('PATCH', '/users/me', ['displayName' => 'นักเรียน', 'hasSeenTutorial' => true], $user);
        $this->assertSame(200, $renamed['status']);
        $this->assertSame('นักเรียน', $renamed['body']['user']['displayName']);
        $this->assertTrue($renamed['body']['user']['hasSeenTutorial']);

        $banned = $this->post('/admin/users/' . $userId . '/ban', ['reason' => 'สแปม'], $admin);
        $this->assertSame(200, $banned['status']);
        $this->assertArrayHasKey('foundu', $banned['cookies']);
        $admin = $banned['cookies'];
        $this->assertSame(200, $this->get('/admin/users', $admin)['status']);
        $this->assertSame(401, $this->get('/users/me', $user)['status']);
        $still = Database::run($this->pdo, 'SELECT ban_status FROM accounts WHERE id = ?', [$userId])->fetchColumn();
        $this->assertSame('banned', $still);
        $revoked = Database::run(
            $this->pdo,
            'SELECT COUNT(*) FROM sessions WHERE account_id = ? AND revoked_at IS NULL AND kind = \'browser\'',
            [$userId]
        )->fetchColumn();
        $this->assertSame(0, (int) $revoked);

        $cleared = $this->post('/admin/users/' . $userId . '/unban', [], $admin);
        $this->assertSame(200, $cleared['status'], json_encode($cleared['body'], JSON_UNESCAPED_UNICODE));
        $user = $this->login('20031');
        $timeout = $this->post('/admin/users/' . $userId . '/timeout', ['reason' => 'พัก', 'durationMinutes' => 30], $admin);
        $this->assertSame(200, $timeout['status']);
        $this->assertNotSame('', $timeout['body']['timeoutUntil']);
        $this->assertSame('timeout', Database::run($this->pdo, 'SELECT ban_status FROM accounts WHERE id = ?', [$userId])->fetchColumn());
        $this->post('/admin/users/' . $userId . '/unban', [], $admin);

        $this->assertSame(403, $this->call('PATCH', '/admin/users/' . $otherId . '/role', ['role' => 'admin'], $other)['status']);
        $promoted = $this->call('PATCH', '/admin/users/' . $otherId . '/role', ['role' => 'admin'], $admin);
        $this->assertSame(200, $promoted['status']);
        $status = $this->get('/auth/session-status', $other);
        $this->assertTrue($status['body']['isAdmin']);
        $this->assertSame(400, $this->call('PATCH', '/admin/users/' . $adminId . '/role', ['role' => 'user'], $admin)['status']);
        $this->assertSame('admin', Database::run($this->pdo, 'SELECT role FROM accounts WHERE id = ?', [$adminId])->fetchColumn());
    }

    public function testLogsAreAdminRead(): void
    {
        $this->student('20041');
        $this->student('20042', 'admin');
        $user = $this->login('20041');
        $admin = $this->login('20042');

        $this->assertSame(401, $this->post('/activity-logs', [
            'action' => 'ดู',
            'actionType' => 'view',
            'targetType' => 'system',
        ])['status']);
        $this->assertSame(403, $this->post('/activity-logs', [
            'action' => 'ดู',
            'actionType' => 'view',
            'targetType' => 'system',
            'userId' => '00000000-0000-4000-8000-000000000001',
        ], $user)['status']);
        $written = $this->post('/activity-logs', [
            'action' => 'เปิดหน้า',
            'actionType' => 'view',
            'targetType' => 'system',
            'userEmail' => 'nope@evil.test',
        ], $user);
        $this->assertSame(201, $written['status']);
        $this->assertSame(403, $this->get('/admin/activity-logs', $user)['status']);
        $logs = $this->get('/admin/activity-logs', $admin);
        $this->assertSame(200, $logs['status']);
        $this->assertSame('20041@students.school.test', $logs['body']['logs'][0]['userEmail']);

        $error = $this->post('/error-logs', ['message' => 'พัง', 'severity' => 'low', 'source' => 'client'], $user);
        $this->assertSame(201, $error['status']);
        $this->assertSame(403, $this->get('/admin/error-logs', $user)['status']);
        $this->assertSame(403, $this->call('PATCH', '/admin/error-logs/' . $error['body']['id'], ['resolved' => true], $user)['status']);
        $resolved = $this->call('PATCH', '/admin/error-logs/' . $error['body']['id'], ['resolved' => true], $admin);
        $this->assertSame(200, $resolved['status']);
        $this->assertTrue($resolved['body']['log']['resolved']);
    }

    public function testChanges304DoesNotTouchTheSession(): void
    {
        $id = $this->student('20051');
        $cookies = $this->login('20051');
        Database::run(
            $this->pdo,
            'UPDATE sessions SET expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 SECOND) WHERE account_id = ? AND revoked_at IS NULL',
            [$id]
        );
        $before = (string) Database::run(
            $this->pdo,
            'SELECT expires_at FROM sessions WHERE account_id = ? AND revoked_at IS NULL',
            [$id]
        )->fetchColumn();

        $first = $this->get('/changes?tables=lost_items,found_items', $cookies);
        $this->assertSame(200, $first['status']);
        $this->assertSame('private, no-store', $this->header($first, 'Cache-Control'));
        $this->assertArrayHasKey('lost_items', $first['body']['tables']);
        $this->assertArrayNotHasKey('Set-Cookie', $first['headers']);
        $etag = $this->header($first, 'ETag');
        $again = $this->call('GET', '/changes?tables=lost_items,found_items', null, $cookies, true, null, ['If-None-Match' => $etag]);
        $this->assertSame(304, $again['status']);
        $this->assertSame('', $again['raw']);
        $afterPoll = (string) Database::run(
            $this->pdo,
            'SELECT expires_at FROM sessions WHERE account_id = ? AND revoked_at IS NULL',
            [$id]
        )->fetchColumn();
        $this->assertSame($before, $afterPoll);

        $this->get('/lost-items', $cookies);
        $afterRead = (string) Database::run(
            $this->pdo,
            'SELECT expires_at FROM sessions WHERE account_id = ? AND revoked_at IS NULL',
            [$id]
        )->fetchColumn();
        $this->assertNotSame($before, $afterRead);

        $this->post('/lost-items', $this->lostBody(), $cookies);
        $stale = $this->call('GET', '/changes?tables=lost_items,found_items', null, [], true, null, ['If-None-Match' => $etag]);
        $this->assertSame(200, $stale['status']);
        $this->assertSame(400, $this->get('/changes?tables=sessions')['status']);
    }

    public function testFeedBumpRollsBackWithTheWrite(): void
    {
        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'lost_items'");
        try {
            Feed::write($this->pdo, 'lost_items', static function (PDO $pdo): void {
                Database::run(
                    $pdo,
                    'INSERT INTO lost_items (id, tracking_code, item_name, category, location_lost, status)
                     VALUES (?, ?, ?, ?, ?, ?)',
                    [Ids::uuid(), 'LOST-TEST01', 'ปากกา', 'other', 'ห้อง', 'searching']
                );
                throw new RuntimeException('stop');
            });
            $this->fail('write should have thrown');
        } catch (RuntimeException $e) {
            $this->assertSame('stop', $e->getMessage());
        }
        $this->assertSame('2000-01-01 00:00:00.000', $this->stamp('lost_items'));
        $left = Database::run($this->pdo, 'SELECT COUNT(*) FROM lost_items WHERE tracking_code = ?', ['LOST-TEST01'])->fetchColumn();
        $this->assertSame(0, (int) $left);
    }

    private function lostBody(string $status = 'searching', ?string $userId = null): array
    {
        $body = [
            'itemName' => 'กระเป๋า',
            'category' => 'bag',
            'locationLost' => 'โรงอาหาร',
            'status' => $status,
            'contacts' => [],
        ];
        if ($userId !== null) {
            $body['userId'] = $userId;
        }
        return $body;
    }

    private function foundBody(string $status = 'pending_room_confirm'): array
    {
        return [
            'description' => 'เจอกระเป๋าสีดำ',
            'locationFound' => 'สนาม',
            'status' => $status,
        ];
    }

    public function testAiUsageAndCmsAuthz(): void
    {
        $userId = $this->student('21001');
        $adminId = $this->student('21002', 'admin');
        $user = $this->login('21001');
        $admin = $this->login('21002');

        $this->assertSame(401, $this->get('/admin/ai-usage')['status']);
        $this->assertSame(403, $this->get('/admin/ai-usage', $user)['status']);
        $this->assertSame(401, $this->post('/ai-usage', ['endpoint' => 'ner'])['status']);
        $this->assertSame(403, $this->post('/ai-usage', ['userId' => $adminId, 'endpoint' => 'ner'], $user)['status']);

        $created = $this->post('/ai-usage', ['userId' => $userId, 'endpoint' => 'ner'], $user);
        $this->assertSame(201, $created['status']);
        $listed = $this->get('/admin/ai-usage', $admin);
        $this->assertSame(200, $listed['status']);
        $this->assertSame($userId, $listed['body']['records'][0]['userId']);

        $this->assertSame(200, $this->get('/articles')['status']);
        $this->assertSame(401, $this->post('/admin/articles', ['title' => 'x'])['status']);
        $this->assertSame(403, $this->post('/admin/articles', ['title' => 'x'], $user)['status']);
        $this->assertSame(501, $this->post('/admin/articles', ['title' => 'x'], $admin)['status']);
        $this->assertSame(401, $this->get('/admin/articles')['status']);
        $this->assertSame(200, $this->get('/admin/articles', $admin)['status']);
        $this->assertSame(404, $this->get('/help/missing-page')['status']);
        $this->assertSame(401, $this->post('/admin/help-pages', ['slug' => 'start'])['status']);
        $this->assertSame(501, $this->post('/admin/help-pages', ['slug' => 'start'], $admin)['status']);
    }

    private function stamp(string $table): string
    {
        $value = Database::run(
            $this->pdo,
            'SELECT updated_at FROM change_feed WHERE table_name = ?',
            [$table]
        )->fetchColumn();
        return (string) $value;
    }

    private function student(string $studentId, string $role = 'user'): string
    {
        $id = Ids::uuid();
        $hash = PasswordHash::hash('Password1');
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $studentId, $role, $hash): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, nickname, role, status, ban_status,
                    is_student_verified, is_registered, has_logged_in_once, current_password_hash,
                    auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, \'active\', \'none\', 1, 1, 1, ?, JSON_ARRAY(\'password\'), JSON_ARRAY())',
                [$id, $studentId, $id, $studentId . '@students.school.test', 'ทดสอบ', 'ทดสอบ', $role, $hash]
            );
        });
        return $id;
    }

    private function login(string $studentId): array
    {
        $result = $this->post('/auth/login', ['studentId' => $studentId, 'password' => 'Password1']);
        $this->assertSame(200, $result['status']);
        return $result['cookies'];
    }

    private function post(string $path, array $json, array $cookies = []): array
    {
        return $this->call('POST', $path, $json, $cookies);
    }

    private function get(string $path, array $cookies = []): array
    {
        return $this->call('GET', $path, null, $cookies);
    }

    private function call(
        string $method,
        string $path,
        ?array $json,
        array $cookies = [],
        bool $csrf = true,
        ?App $app = null,
        array $extraHeaders = [],
    ): array {
        $this->ip++;
        $server = [
            'REMOTE_ADDR' => '203.0.113.' . $this->ip,
            'REQUEST_URI' => '/api' . $path,
            'HTTPS' => '',
        ];
        $headers = ['Content-Type' => 'application/json'];
        if ($csrf && isset($cookies['foundu_csrf'])) {
            $headers['X-CSRF-Token'] = $cookies['foundu_csrf'];
        }
        foreach ($extraHeaders as $name => $value) {
            $headers[$name] = $value;
        }
        $uri = 'http://localhost:8080/api' . $path;
        $request = (new ServerRequestFactory())->createServerRequest($method, $uri, $server);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($cookies !== []) {
            $request = $request->withCookieParams($cookies);
        }
        if ($json !== null) {
            $payload = $json === []
                ? '{}'
                : json_encode($json, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $request->getBody()->write($payload);
        }
        $response = ($app ?? $this->app)->handle($request);
        $raw = (string) $response->getBody();
        $body = json_decode($raw, true);
        $jar = $cookies;
        foreach ($response->getHeader('Set-Cookie') as $line) {
            $pair = explode(';', $line, 2)[0];
            $eq = strpos($pair, '=');
            if ($eq === false) {
                continue;
            }
            $name = substr($pair, 0, $eq);
            $value = substr($pair, $eq + 1);
            if ($value === '' || str_contains($line, 'Max-Age=0')) {
                unset($jar[$name]);
            } else {
                $jar[$name] = $value;
            }
        }
        $headersOut = [];
        foreach ($response->getHeaders() as $name => $values) {
            $headersOut[$name] = $values[0] ?? '';
        }
        return [
            'status' => $response->getStatusCode(),
            'body' => is_array($body) ? $body : [],
            'raw' => $raw,
            'cookies' => $jar,
            'headers' => $headersOut,
        ];
    }

    private function header(array $response, string $name): string
    {
        foreach ($response['headers'] as $key => $value) {
            if (strcasecmp((string) $key, $name) === 0) {
                return (string) $value;
            }
        }
        return '';
    }
}
