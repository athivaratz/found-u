<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Data\Geocode;
use Foundu\Database;
use Foundu\Http\HttpError;
use Foundu\Ids;
use Foundu\Kernel;
use PDO;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class P10HttpTest extends DbTestCase
{
    private App $app;

    private int $ip = 40;

    protected function setUp(): void
    {
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        putenv('GEOCODE_USER_AGENT=Found-U test (test@example.com)');
        parent::setUp();
        $this->pdo->exec('DELETE FROM nfc_found_reports');
        $this->pdo->exec('DELETE FROM nfc_tags');
        $this->pdo->exec('DELETE FROM help_sections');
        $this->pdo->exec('DELETE FROM help_pages');
        $this->pdo->exec('DELETE FROM articles');
        $this->pdo->exec('DELETE FROM geocode_cache');
        $this->pdo->exec("UPDATE app_settings SET settings = JSON_SET(settings, '$.nfcEnabled', true) WHERE id = 'default'");
        Geocode::$fetch = null;
        $this->app = Kernel::create(dirname(__DIR__));
    }

    protected function tearDown(): void
    {
        Geocode::$fetch = null;
        parent::tearDown();
    }

    public function testArticleAndHelpWrites(): void
    {
        $this->student('31001', 'admin');
        $this->student('31002');
        $admin = $this->login('31001');
        $user = $this->login('31002');

        $this->assertSame(401, $this->post('/admin/articles', $this->articleBody())['status']);
        $this->assertSame(403, $this->post('/admin/articles', $this->articleBody(), $user)['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'articles'");
        $created = $this->post('/admin/articles', $this->articleBody(), $admin);
        $this->assertSame(201, $created['status'], $created['raw']);
        $article = $created['body']['article'];
        $this->assertSame('draft', $article['status']);
        $this->assertSame('กระเป๋าหาย', $article['title']);
        $this->assertSame('how-bags', $article['slug']);
        $this->assertArrayHasKey('content_json', $article);
        $this->assertSame('doc', $article['content_json']['type']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('articles'));

        $again = $this->post('/admin/articles', $this->articleBody('how-bags-2'), $admin);
        $this->assertSame(201, $again['status']);
        $clash = $this->post('/admin/articles', $this->articleBody('how-bags'), $admin);
        $this->assertSame(409, $clash['status']);
        $this->assertSame('slug', $clash['body']['field']);

        $dirty = $this->articleBody();
        $dirty['content_json'] = [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'content' => [[
                    'type' => 'text',
                    'text' => 'คลิก',
                    'marks' => [['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']]],
                ]],
            ], [
                'type' => 'image',
                'attrs' => ['src' => 'javascript:alert(1)', 'alt' => 'x'],
            ]],
        ];
        $patched = $this->call('PATCH', '/admin/articles/' . $article['id'], $dirty, $admin);
        $this->assertSame(200, $patched['status'], $patched['raw']);
        $saved = $patched['body']['article']['content_json']['content'][0]['content'][0];
        $this->assertSame('คลิก', $saved['text']);
        $this->assertArrayNotHasKey('marks', $saved);
        $this->assertCount(1, $patched['body']['article']['content_json']['content']);

        $this->assertSame(404, $this->get('/articles/how-bags')['status']);
        $published = $this->call('PATCH', '/admin/articles/' . $article['id'], [
            'status' => 'published',
            'published_at' => '2026-01-02T03:04:05.000Z',
        ], $admin);
        $this->assertSame(200, $published['status']);
        $public = $this->get('/articles/how-bags');
        $this->assertSame(200, $public['status']);
        $this->assertSame('กระเป๋าหาย', $public['body']['article']['title']);
        $this->assertStringContainsString('public', $this->header($public, 'Cache-Control'));

        $this->assertSame(403, $this->call('DELETE', '/admin/articles/' . $article['id'], null, $user)['status']);
        $this->assertSame(200, $this->call('DELETE', '/admin/articles/' . $article['id'], null, $admin)['status']);
        $this->assertSame(404, $this->get('/articles/how-bags')['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'help_pages'");
        $page = $this->post('/admin/help-pages', [
            'slug' => 'how-to-use',
            'title' => 'วิธีใช้',
            'description' => 'คำอธิบาย',
            'intro' => "บรรทัดแรก\n\n- ข้อหนึ่ง",
        ], $admin);
        $this->assertSame(201, $page['status'], $page['raw']);
        $this->assertSame('วิธีใช้', $page['body']['page']['title']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('help_pages'));

        $evil = $this->call('PATCH', '/admin/help-pages/how-to-use', [
            'intro' => '<p>ปลอดภัย</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><a href="https://example.com/help">ลิงก์</a>',
        ], $admin);
        $this->assertSame(200, $evil['status'], $evil['raw']);
        $intro = (string) $evil['body']['page']['intro'];
        $this->assertStringContainsString('ปลอดภัย', $intro);
        $this->assertStringContainsString('https://example.com/help', $intro);
        $this->assertStringNotContainsString('<script', strtolower($intro));
        $this->assertStringNotContainsString('onerror', strtolower($intro));
        $this->assertStringNotContainsString('javascript:', strtolower($intro));

        $section = $this->post('/admin/help-sections', [
            'page_slug' => 'how-to-use',
            'section_type' => 'faq',
            'audience' => 'student',
            'title' => 'ถาม',
            'body' => 'ตอบ',
            'sort_order' => 10,
        ], $admin);
        $this->assertSame(201, $section['status'], $section['raw']);
        $sectionId = $section['body']['section']['id'];
        $this->assertSame(403, $this->call('PATCH', '/admin/help-sections/' . $sectionId, ['sort_order' => 1], $user)['status']);
        $moved = $this->call('PATCH', '/admin/help-sections/' . $sectionId, ['sort_order' => 1], $admin);
        $this->assertSame(200, $moved['status']);
        $this->assertSame(1, $moved['body']['section']['sort_order']);
        $help = $this->get('/help/how-to-use');
        $this->assertSame(200, $help['status']);
        $this->assertSame('ถาม', $help['body']['sections'][0]['title']);
        $this->assertSame(200, $this->call('DELETE', '/admin/help-sections/' . $sectionId, null, $admin)['status']);
        $this->assertSame(403, $this->post('/admin/help-pages', ['slug' => 'other', 'title' => 'x'], $user)['status']);
    }

    public function testNfcAuthzAndLimits(): void
    {
        $ownerId = $this->student('32001');
        $otherId = $this->student('32002');
        $adminId = $this->student('32003', 'admin');
        $owner = $this->login('32001');
        $other = $this->login('32002');
        $admin = $this->login('32003');

        $this->assertSame(400, $this->get('/nfc/resolve')['status']);
        $this->assertSame('tag parameter required', $this->get('/nfc/resolve')['body']['error']);
        $this->assertSame(404, $this->get('/nfc/resolve?tag=ABCDEFGHJKLM')['status']);
        $this->assertSame(401, $this->post('/nfc/register', $this->tagBody())['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'nfc_tags'");
        $created = $this->post('/nfc/register', $this->tagBody(), $owner);
        $this->assertSame(200, $created['status'], $created['raw']);
        $tagId = $created['body']['tagId'];
        $this->assertSame(12, strlen($tagId));
        $this->assertStringContainsString('/nfc/t/' . $tagId, $created['body']['tagUrl']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('nfc_tags'));

        $this->assertSame(409, $this->post('/nfc/register', $this->tagBody(), $other)['status']);
        $resolve = $this->get('/nfc/resolve?tag=' . strtolower($tagId));
        $this->assertSame(200, $resolve['status'], $resolve['raw']);
        $this->assertFalse($resolve['body']['isOwner']);
        $this->assertArrayNotHasKey('ownerId', $resolve['body']);
        $this->assertArrayNotHasKey('contacts', $resolve['body']['tag']);
        $asOwner = $this->get('/nfc/resolve?tag=' . $tagId, $owner);
        $this->assertTrue($asOwner['body']['isOwner']);
        $this->assertSame($ownerId, $asOwner['body']['ownerId']);

        $this->assertSame(403, $this->get('/nfc/tags/' . $tagId, $other)['status']);
        $this->assertSame(200, $this->get('/nfc/tags/' . $tagId, $owner)['status']);
        $this->assertSame(403, $this->get('/nfc/tags?ownerId=' . $ownerId, $other)['status']);
        $mine = $this->get('/nfc/tags?ownerId=' . $ownerId, $owner);
        $this->assertSame($tagId, $mine['body']['items'][0]['id']);
        $this->assertSame(403, $this->get('/nfc/tags?limit=10', $owner)['status']);
        $this->assertSame(200, $this->get('/nfc/tags?limit=10', $admin)['status']);

        $rejected = $this->call('PATCH', '/nfc/tags/' . $tagId, ['status' => 'lost', 'ownerId' => $otherId], $owner);
        $this->assertSame(400, $rejected['status']);
        $this->assertSame('invalid_input', $rejected['body']['error']);
        $lost = $this->call('PATCH', '/nfc/tags/' . $tagId, ['status' => 'lost'], $owner);
        $this->assertSame(200, $lost['status'], $lost['raw']);
        $this->assertSame(403, $this->call('PATCH', '/nfc/tags/' . $tagId, ['status' => 'active'], $other)['status']);
        $this->assertSame(200, $this->call('PATCH', '/nfc/tags/' . $tagId, ['status' => 'active'], $admin)['status']);

        $dashboard = $this->get('/nfc/my-tags', $owner);
        $this->assertSame(200, $dashboard['status']);
        $this->assertSame($tagId, $dashboard['body']['tags'][0]['id']);
        $this->assertSame(401, $this->get('/nfc/my-tags')['status']);

        $own = $this->post('/nfc/found', [
            'tagId' => $tagId,
            'finderMessage' => 'ของฉันเอง',
        ], $owner);
        $this->assertSame(403, $own['status']);
        $this->assertSame('cannot_report_own_tag', $own['body']['error']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'nfc_found_reports'");
        $spoof = $this->post('/nfc/found-reports', [
            'tagId' => $tagId,
            'ownerId' => $otherId,
            'finderUserId' => $ownerId,
            'finderMessage' => 'แอบอ้าง',
        ], $other);
        $this->assertSame(403, $spoof['status']);
        $report = $this->post('/nfc/found', [
            'tagId' => $tagId,
            'finderMessage' => 'เจอที่โรงอาหาร',
            'finderContacts' => [['type' => 'phone', 'value' => '0812345678']],
        ], $other);
        $this->assertSame(200, $report['status'], $report['raw']);
        $reportId = $report['body']['reportId'];
        $this->assertTrue($report['body']['success']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('nfc_found_reports'));
        $stored = Database::run($this->pdo, 'SELECT owner_id, finder_user_id FROM nfc_found_reports WHERE id = ?', [$reportId])->fetch();
        $this->assertSame($ownerId, $stored['owner_id']);
        $this->assertSame($otherId, $stored['finder_user_id']);

        $this->assertSame(403, $this->call('PATCH', '/nfc/reports/' . $reportId, ['status' => 'resolved'], $other)['status']);
        $this->assertSame(200, $this->call('PATCH', '/nfc/reports/' . $reportId, ['status' => 'viewed'], $owner)['status']);
        $this->assertSame(403, $this->get('/nfc/found-reports?ownerId=' . $ownerId, $other)['status']);
        $byOwner = $this->get('/nfc/found-reports?ownerId=' . $ownerId, $owner);
        $this->assertSame($reportId, $byOwner['body']['items'][0]['id']);

        $now = time();
        $window = $now - ($now % 3600);
        Database::run(
            $this->pdo,
            'INSERT INTO rate_limits (scope, subject, window_start, hits) VALUES (?, ?, ?, 20)
             ON DUPLICATE KEY UPDATE hits = 20',
            ['nfc_found', $otherId, Ids::utc($window)]
        );
        $limited = $this->post('/nfc/found', ['tagId' => $tagId, 'finderMessage' => 'อีกครั้ง'], $other);
        $this->assertSame(429, $limited['status']);
        $this->assertSame('rate_limit_exceeded', $limited['body']['error']);
        $this->assertNotSame('', $this->header($limited, 'Retry-After'));

        $this->call('PATCH', '/admin/settings', ['nfcEnabled' => false], $admin);
        $disabled = $this->post('/nfc/register', [
            'itemName' => 'ใหม่',
            'category' => 'bag',
            'contacts' => [['type' => 'line', 'value' => 'foundu']],
        ], $owner);
        $this->assertSame(403, $disabled['status']);
        $this->assertSame('nfc_disabled', $disabled['body']['error']);
        $this->assertNotSame('', $adminId);
    }

    public function testGeocodeCacheAndLimit(): void
    {
        $this->student('33001', 'admin');
        $this->student('33002');
        $admin = $this->login('33001');
        $user = $this->login('33002');
        $this->assertSame(401, $this->get('/geocode/search?q=โรงเรียน')['status']);
        $this->assertSame(403, $this->get('/geocode/search?q=โรงเรียน', $user)['status']);
        $short = $this->get('/geocode/search?q=a', $admin);
        $this->assertSame(200, $short['status']);
        $this->assertSame([], $short['body']['results']);

        $calls = 0;
        Geocode::$fetch = static function (string $url, string $ua, int $timeout = 8) use (&$calls): string {
            $calls++;
            if (!str_contains($url, 'countrycodes=th')) {
                throw new HttpError(500, 'missing country');
            }
            if (!str_contains($ua, 'test@example.com')) {
                throw new HttpError(500, 'missing agent');
            }
            return json_encode([[
                'place_id' => 42,
                'display_name' => 'โรงเรียนทดสอบ',
                'lat' => '13.75',
                'lon' => '100.50',
            ]], JSON_THROW_ON_ERROR);
        };
        $first = $this->get('/geocode/search?q=' . rawurlencode('โรงเรียน ทดสอบ'), $admin);
        $this->assertSame(200, $first['status'], $first['raw']);
        $this->assertSame('42', $first['body']['results'][0]['id']);
        $this->assertSame(13.75, $first['body']['results'][0]['lat']);
        $second = $this->get('/geocode/search?q=' . rawurlencode('โรงเรียน   ทดสอบ'), $admin);
        $this->assertSame(200, $second['status']);
        $this->assertSame(1, $calls);
        $busy = $this->get('/geocode/search?q=' . rawurlencode('อีกที่หนึ่ง'), $admin);
        $this->assertSame(429, $busy['status']);
        $this->assertSame('Too many requests. Please wait a moment.', $busy['body']['error']);
        $this->assertSame(1, $calls);

        Geocode::$fetch = static function (string $url, string $ua, int $timeout = 8): string {
            throw new HttpError(502, 'Geocoding request failed');
        };
        $this->pdo->exec('DELETE FROM rate_limits');
        $this->pdo->exec('DELETE FROM geocode_cache');
        $down = $this->get('/geocode/search?q=' . rawurlencode('ไม่มีแคช'), $admin);
        $this->assertSame(502, $down['status']);
        $this->assertSame('Geocoding request failed', $down['body']['error']);
    }

    private function articleBody(string $slug = 'how-bags'): array
    {
        return [
            'title' => 'กระเป๋าหาย',
            'slug' => $slug,
            'section' => 'blog',
            'status' => 'draft',
            'content_json' => ['type' => 'doc', 'content' => []],
            'tags' => ['กระเป๋า'],
        ];
    }

    private function tagBody(): array
    {
        return [
            'itemName' => 'บัตรนักเรียน',
            'category' => 'card',
            'description' => 'สีฟ้า',
            'contacts' => [['type' => 'phone', 'value' => '0811111111']],
            'tagUid' => '04:AB:CD:11',
            'readOnlyLocked' => true,
        ];
    }

    private function student(string $studentId, string $role = 'user'): string
    {
        $id = Ids::uuid();
        $hash = \Foundu\Auth\PasswordHash::hash('Password1');
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
        $this->assertSame(200, $result['status'], $result['raw'] ?? '');
        return $result['cookies'];
    }

    private function stamp(string $table): string
    {
        return (string) Database::run(
            $this->pdo,
            'SELECT updated_at FROM change_feed WHERE table_name = ?',
            [$table]
        )->fetchColumn();
    }

    private function post(string $path, array $json, array $cookies = []): array
    {
        return $this->call('POST', $path, $json, $cookies);
    }

    private function get(string $path, array $cookies = []): array
    {
        return $this->call('GET', $path, null, $cookies);
    }

    private function call(string $method, string $path, ?array $json, array $cookies = []): array
    {
        $this->ip++;
        $server = [
            'REMOTE_ADDR' => '203.0.113.' . ($this->ip % 200),
            'REQUEST_URI' => '/api' . $path,
            'HTTPS' => '',
        ];
        $headers = ['Content-Type' => 'application/json'];
        if (isset($cookies['foundu_csrf'])) {
            $headers['X-CSRF-Token'] = $cookies['foundu_csrf'];
        }
        $request = (new ServerRequestFactory())->createServerRequest($method, 'http://localhost:8080/api' . $path, $server);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($cookies !== []) {
            $request = $request->withCookieParams($cookies);
        }
        if ($json !== null) {
            $payload = $json === [] ? '{}' : json_encode($json, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $request->getBody()->write($payload);
        }
        $response = $this->app->handle($request);
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
