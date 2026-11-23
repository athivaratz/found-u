<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Ai\Runtime;
use Foundu\Ai\Upstream;
use Foundu\Ai\UpstreamResult;
use Foundu\Auth\PasswordHash;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Kernel;
use PDO;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ScriptedUpstream implements Upstream
{
    public int $calls = 0;

    public array $urls = [];

    public function __construct(private array $script)
    {
    }

    public function request(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds): UpstreamResult
    {
        $this->calls++;
        $this->urls[] = $url;
        $next = array_shift($this->script);
        return $next instanceof UpstreamResult
            ? $next
            : new UpstreamResult(500, '', 'unscripted');
    }
}

final class AiPipelineTest extends DbTestCase
{
    private App $app;

    private int $ip = 40;

    private const GEMINI = 'AIza-test-gemini-key-0001';

    private const OPENROUTER = 'sk-or-test-openrouter-0001';

    protected function setUp(): void
    {
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        putenv('GEMINI_API_KEY');
        putenv('OPENROUTER_API_KEY');
        Runtime::reset();
        parent::setUp();
        foreach (['match_dismissals', 'lost_items', 'found_items', 'ai_credentials', 'app_settings'] as $table) {
            $this->pdo->exec('DELETE FROM ' . $table);
        }
        $this->app = Kernel::create(dirname(__DIR__));
    }

    protected function tearDown(): void
    {
        Runtime::reset();
        parent::tearDown();
    }

    public function testSearchHttpMatchesFixtureQueries(): void
    {
        $fixture = json_decode((string) file_get_contents(__DIR__ . '/fixtures/search-expected.json'), true, 32, JSON_THROW_ON_ERROR);
        foreach ($fixture['items'] as $item) {
            Database::run(
                $this->pdo,
                'INSERT INTO lost_items (id, tracking_code, item_name, category, description, location_lost, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $item['id'],
                    $item['tracking_code'],
                    $item['item_name'],
                    $item['category'],
                    $item['description'],
                    $item['location'],
                    $item['status'],
                    $item['created_at'],
                ]
            );
        }
        $checked = ['หูฟัง', 'เงิน', 'LOST-EAR00', 'iphone'];
        foreach ($fixture['queries'] as $query) {
            if (!in_array($query['q'], $checked, true)) {
                continue;
            }
            $response = $this->get('/search?type=lost&limit=5&threshold=0.15&q=' . rawurlencode((string) $query['q']));
            $this->assertSame(200, $response['status'], (string) $query['q']);
            $ids = array_column($response['body']['lost'], 'id');
            $this->assertSame($query['expected'], $ids, (string) $query['q']);
        }
    }

    public function testMatchConfirmUnmatchRejectAndAuthz(): void
    {
        $this->student('31001');
        $this->student('31002', 'admin');
        $user = $this->login('31001');
        $admin = $this->login('31002');

        $lost = $this->post('/lost-items', [
            'itemName' => 'หูฟัง',
            'category' => 'electronics',
            'description' => 'หูฟังสีดำ',
            'locationLost' => 'ห้องสมุด',
            'status' => 'searching',
            'contacts' => [],
        ], $user);
        $this->assertSame(201, $lost['status']);
        $found = $this->post('/found-items', [
            'itemName' => 'หูฟัง',
            'category' => 'electronics',
            'description' => 'หูฟังสีดำ ที่ห้องสมุด',
            'locationFound' => 'ห้องสมุด',
            'color' => 'ดำ',
            'status' => 'pending_room_confirm',
        ], $user);
        $this->assertSame(201, $found['status']);
        $lostId = $lost['body']['id'];
        $foundId = $found['body']['id'];

        $guest = $this->post('/match', ['type' => 'lost', 'itemId' => $lostId]);
        $this->assertSame(200, $guest['status']);
        $this->assertNotEmpty($guest['body']['matches']);
        $this->assertSame($foundId, $guest['body']['matches'][0]['foundItem']['id']);
        $this->assertGreaterThanOrEqual(40, $guest['body']['matches'][0]['scorePercentage']);
        $this->assertArrayHasKey('reasons', $guest['body']['matches'][0]);

        $this->assertSame(401, $this->post('/match/confirm', ['lostId' => $lostId, 'foundId' => $foundId])['status']);
        $this->assertSame(403, $this->post('/match/confirm', ['lostId' => $lostId, 'foundId' => $foundId], $user)['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name IN ('lost_items', 'found_items')");
        $confirmed = $this->post('/match/confirm', ['lostId' => $lostId, 'foundId' => $foundId], $admin);
        $this->assertSame(200, $confirmed['status']);
        $this->assertSame('found', $confirmed['body']['lostStatus']);
        $this->assertSame('found', $this->get('/lost-items/' . $lostId)['body']['item']['status']);
        $this->assertSame($foundId, $this->get('/lost-items/' . $lostId)['body']['item']['matchedFoundId']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('lost_items'));
        $this->assertGreaterThan('2000-01-02', $this->stamp('found_items'));

        $again = $this->post('/match/confirm', ['lostId' => $lostId, 'foundId' => $foundId], $admin);
        $this->assertSame(409, $again['status']);
        $this->assertSame('lost_not_matchable', $again['body']['error']);

        $unmatched = $this->post('/match/unmatch', ['lostId' => $lostId, 'foundId' => $foundId], $admin);
        $this->assertSame(200, $unmatched['status']);
        $this->assertSame('searching', $this->get('/lost-items/' . $lostId)['body']['item']['status']);

        $this->pdo->exec("UPDATE change_feed SET updated_at = '2000-01-01 00:00:00.000' WHERE table_name = 'match_dismissals'");
        $rejected = $this->post('/match/reject', ['lostId' => $lostId, 'foundId' => $foundId], $admin);
        $this->assertSame(200, $rejected['status']);
        $this->assertGreaterThan('2000-01-02', $this->stamp('match_dismissals'));
        $after = $this->post('/match', ['type' => 'lost', 'itemId' => $lostId], $user);
        $this->assertSame([], $after['body']['matches']);

        $batch = $this->get('/match/batch', $admin);
        $this->assertSame(200, $batch['status']);
        $this->assertArrayHasKey('lost', $batch['body']['pool']);
        $this->assertArrayHasKey('found', $batch['body']['pool']);
        $this->assertArrayHasKey('highConfidence', $batch['body']['pool']);
        $this->assertSame(403, $this->get('/match/batch', $user)['status']);
        $this->assertSame(404, $this->post('/match', ['type' => 'lost', 'itemId' => '00000000-0000-4000-8000-000000000099'], $user)['status']);
        $this->assertSame('Item not found', $this->post('/match', ['type' => 'lost', 'itemId' => '00000000-0000-4000-8000-000000000099'], $user)['body']['error']);
    }

    public function testVisionNerFallbackQuotaAndSemaphore(): void
    {
        $userId = $this->student('32001');
        $adminId = $this->student('32002', 'admin');
        $user = $this->login('32001');
        $admin = $this->login('32002');
        $this->saveKeys($admin);

        $script = new ScriptedUpstream([
            $this->gemini('{"itemName":"หูฟัง","category":"electronics","color":"ดำ","brand":null,"details":"ไร้สาย","confidence":"high"}'),
            $this->gemini('{"itemName":"หูฟัง","category":"electronics","color":"ดำ","brand":null,"details":"ไร้สาย","confidence":"high"}'),
        ]);
        Runtime::$upstream = $script;
        $image = 'data:image/png;base64,' . base64_encode('not-a-real-png');
        $guest = $this->post('/vision', ['imageDataUrl' => $image]);
        $this->assertSame(401, $guest['status']);
        $this->assertSame(0, $script->calls);

        $vision = $this->post('/vision', ['imageDataUrl' => $image, 'userId' => $adminId, 'testMode' => true], $user);
        $this->assertSame(200, $vision['status'], $vision['raw']);
        $this->assertSame('หูฟัง', $vision['body']['data']['itemName']);
        $this->assertArrayNotHasKey('debug', $vision['body']);
        $this->assertSame(1, (int) Database::run($this->pdo, 'SELECT COUNT(*) FROM ai_usage WHERE user_id = ?', [$userId])->fetchColumn());
        $this->assertStringNotContainsString(self::GEMINI, $vision['raw']);

        $adminVision = $this->post('/vision', ['imageDataUrl' => $image, 'testMode' => true], $admin);
        $this->assertSame(200, $adminVision['status'], $adminVision['raw']);
        $this->assertArrayHasKey('debug', $adminVision['body']);
        $this->assertStringNotContainsString(self::GEMINI, $adminVision['raw']);
        $this->assertSame(0, (int) Database::run($this->pdo, 'SELECT COUNT(*) FROM ai_usage WHERE user_id = ?', [$adminId])->fetchColumn());

        $fallback = new ScriptedUpstream([
            new UpstreamResult(500, '{"error":"down"}', null),
            $this->openrouter('{"item":"กระเป๋า","category":"bag","location":"โรงอาหาร","target":"lost"}'),
        ]);
        Runtime::$upstream = $fallback;
        $ner = $this->post('/ner', ['text' => 'กระเป๋าหายที่โรงอาหาร', 'type' => 'lost'], $user);
        $this->assertSame(200, $ner['status']);
        $this->assertSame('กระเป๋า', $ner['body']['item']);
        $this->assertSame(2, $fallback->calls);
        $this->assertStringContainsString('generativelanguage.googleapis.com', $fallback->urls[0]);
        $this->assertStringContainsString('openrouter.ai', $fallback->urls[1]);
        $this->assertStringNotContainsString(self::GEMINI, $ner['raw']);
        $this->assertStringNotContainsString(self::OPENROUTER, $ner['raw']);

        $this->pdo->exec('DELETE FROM ai_usage');
        $now = Ids::utc(time());
        for ($i = 0; $i < 5; $i++) {
            Database::run(
                $this->pdo,
                'INSERT INTO ai_usage (id, user_id, endpoint, created_at) VALUES (?, ?, \'vision\', ?)',
                [Ids::uuid(), $userId, $now]
            );
        }
        $blocked = new ScriptedUpstream([]);
        Runtime::$upstream = $blocked;
        $limited = $this->post('/vision', ['imageDataUrl' => $image], $user);
        $this->assertSame(429, $limited['status']);
        $this->assertSame('rate_limit_exceeded', $limited['body']['error']);
        $this->assertSame('user_minute', $limited['body']['reason']);
        $this->assertSame(0, $blocked->calls);

        $this->pdo->exec('DELETE FROM ai_usage');
        $future = Ids::utc(time() + 120);
        for ($i = 0; $i < 3; $i++) {
            Database::run(
                $this->pdo,
                'INSERT INTO ai_slots (account_id, token, acquired_at, expires_at) VALUES (?, ?, ?, ?)',
                [$userId, Ids::uuid(), $now, $future]
            );
        }
        $queued = $this->post('/ner', ['text' => 'กุญแจ', 'type' => 'lost'], $user);
        $this->assertSame(429, $queued['status']);
        $this->assertSame('queue_full', $queued['body']['reason']);
        $this->assertSame('คิว AI เต็ม ลองใหม่อีกสักครู่', $queued['body']['message']);
        $this->assertSame(0, $blocked->calls);
        $this->assertSame(0, (int) Database::run($this->pdo, 'SELECT COUNT(*) FROM ai_usage WHERE user_id = ?', [$userId])->fetchColumn());
    }

    public function testCredentialEncryptionRoundTrip(): void
    {
        $this->student('33001');
        $this->student('33002', 'admin');
        $user = $this->login('33001');
        $admin = $this->login('33002');
        $this->assertSame(401, $this->get('/admin/ai-credentials')['status']);
        $this->assertSame(403, $this->get('/admin/ai-credentials', $user)['status']);

        $saved = $this->call('PATCH', '/admin/ai-credentials', [
            'provider' => 'auto',
            'geminiApiKey' => self::GEMINI,
            'openrouterApiKey' => self::OPENROUTER,
            'openrouterModel' => 'google/gemini-2.0-flash-exp:free',
        ], $admin);
        $this->assertSame(200, $saved['status'], $saved['raw']);
        $this->assertTrue($saved['body']['hasGeminiKey']);
        $this->assertTrue($saved['body']['hasOpenrouterKey']);
        $this->assertStringNotContainsString(self::GEMINI, $saved['raw']);
        $this->assertStringNotContainsString(self::OPENROUTER, $saved['raw']);

        $row = Database::run($this->pdo, 'SELECT gemini_ciphertext, gemini_nonce, openrouter_ciphertext FROM ai_credentials WHERE id = \'default\'', [])->fetch();
        $this->assertIsArray($row);
        $this->assertFalse(str_contains((string) $row['gemini_ciphertext'], self::GEMINI));
        $this->assertFalse(str_contains((string) $row['openrouter_ciphertext'], self::OPENROUTER));
        $this->assertSame(24, strlen((string) $row['gemini_nonce']));
        $firstNonce = (string) $row['gemini_nonce'];

        $rotated = $this->post('/admin/ai-credentials/rotate', [], $admin);
        $this->assertSame(200, $rotated['status'], $rotated['raw']);
        $this->assertTrue($rotated['body']['hasGeminiKey']);
        $this->assertStringNotContainsString(self::GEMINI, $rotated['raw']);
        $second = Database::run($this->pdo, 'SELECT gemini_ciphertext, gemini_nonce FROM ai_credentials WHERE id = \'default\'', [])->fetch();
        $this->assertNotSame($firstNonce, (string) $second['gemini_nonce']);
        $this->assertFalse(str_contains((string) $second['gemini_ciphertext'], self::GEMINI));

        $probe = new ScriptedUpstream([
            $this->gemini('{"ok":true}'),
        ]);
        Runtime::$upstream = $probe;
        $tested = $this->post('/admin/ai-credentials/test', ['provider' => 'gemini'], $admin);
        $this->assertSame(200, $tested['status']);
        $this->assertTrue($tested['body']['providers']['gemini']['ok']);
        $this->assertStringNotContainsString(self::GEMINI, $tested['raw']);
        $this->assertStringContainsString('key=', $probe->urls[0]);
        $this->assertStringContainsString(rawurlencode(self::GEMINI), $probe->urls[0]);
    }

    private function saveKeys(array $admin): void
    {
        $saved = $this->call('PATCH', '/admin/ai-credentials', [
            'provider' => 'auto',
            'geminiApiKey' => self::GEMINI,
            'openrouterApiKey' => self::OPENROUTER,
        ], $admin);
        $this->assertSame(200, $saved['status'], $saved['raw'] ?? '');
    }

    private function gemini(string $json): UpstreamResult
    {
        $body = json_encode([
            'candidates' => [['content' => ['parts' => [['text' => $json]]]]],
        ], JSON_THROW_ON_ERROR);
        return new UpstreamResult(200, $body, null);
    }

    private function openrouter(string $json): UpstreamResult
    {
        $body = json_encode([
            'choices' => [['message' => ['content' => $json]]],
        ], JSON_THROW_ON_ERROR);
        return new UpstreamResult(200, $body, null);
    }

    private function stamp(string $table): string
    {
        return (string) Database::run($this->pdo, 'SELECT updated_at FROM change_feed WHERE table_name = ?', [$table])->fetchColumn();
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
        $this->assertSame(200, $result['status'], $result['raw'] ?? '');
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

    private function call(string $method, string $path, ?array $json, array $cookies = []): array
    {
        $this->ip++;
        $server = [
            'REMOTE_ADDR' => '203.0.113.' . $this->ip,
            'REQUEST_URI' => '/api' . $path,
            'HTTPS' => '',
        ];
        $headers = ['Content-Type' => 'application/json', 'X-Requested-With' => 'foundu'];
        if (isset($cookies['foundu_csrf'])) {
            $headers['X-CSRF-Token'] = $cookies['foundu_csrf'];
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
        return [
            'status' => $response->getStatusCode(),
            'body' => is_array($body) ? $body : [],
            'raw' => $raw,
            'cookies' => $jar,
        ];
    }
}
