<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\PasswordHash;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Kernel;
use Foundu\Storage\SigV4;
use PDO;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class StorageHttpTest extends DbTestCase
{
    private const ACCESS = 'AKIAIOSFODNN7EXAMPLE';
    private const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    private const PUBLIC = 'https://files.example.test';

    private App $app;

    private int $ip = 40;

    protected function setUp(): void
    {
        putenv('APP_ENV=local');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('RATE_LIMIT_PRESIGN_PER_HOUR=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('R2_ACCOUNT_ID=0123456789abcdef0123456789abcdef');
        putenv('R2_ACCESS_KEY_ID=' . self::ACCESS);
        putenv('R2_SECRET_ACCESS_KEY=' . self::SECRET);
        putenv('R2_BUCKET_NAME=foundu');
        putenv('R2_PUBLIC_BASE_URL=' . self::PUBLIC);
        putenv('R2_ENDPOINT');
        putenv('R2_REGION');
        parent::setUp();
        $this->app = Kernel::create(dirname(__DIR__));
    }

    public function testPresignAndDeleteFollowTheActor(): void
    {
        $ownerId = $this->student('30001');
        $otherId = $this->student('30002');
        $adminId = $this->student('30003', 'admin');
        $owner = $this->login('30001');
        $other = $this->login('30002');
        $admin = $this->login('30003');

        $body = [
            'purpose' => 'avatar',
            'contentType' => 'image/jpeg',
            'contentLength' => 128,
            'path' => 'avatars/' . $otherId . '/evil.php',
        ];
        $this->assertSame(401, $this->post('/storage/upload', $body)['status']);
        $this->assertSame(401, $this->post('/storage/upload', $body + ['turnstileToken' => 'fake'])['status']);
        $this->assertSame(403, $this->post('/storage/upload', $body, $owner, false)['status']);

        $made = $this->post('/storage/upload', $body, $owner);
        $this->assertSame(200, $made['status']);
        $this->assertSame('r2', $made['body']['backend']);
        $this->assertSame(128, $made['body']['contentLength']);
        $this->assertSame('image/jpeg', $made['body']['contentType']);
        $path = (string) $made['body']['path'];
        $this->assertMatchesRegularExpression(
            '#^avatars/' . preg_quote($ownerId, '#') . '/[0-9a-f]{32}\\.jpg$#',
            $path
        );
        $this->assertSame(self::PUBLIC . '/' . $path, $made['body']['publicUrl']);
        $this->assertStringStartsWith(
            'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/foundu/' . $path . '?',
            (string) $made['body']['uploadUrl']
        );
        $this->assertSignedPut((string) $made['body']['uploadUrl'], 'image/jpeg', 128);

        $row = Database::run($this->pdo, 'SELECT account_id, purpose, bytes FROM storage_objects WHERE object_key = ?', [$path])->fetch();
        $this->assertSame($ownerId, $row['account_id']);
        $this->assertSame('avatar', $row['purpose']);
        $this->assertSame(128, (int) $row['bytes']);

        $this->assertSame(401, $this->post('/storage/delete', ['path' => $path])['status']);
        $this->assertSame(403, $this->post('/storage/delete', ['path' => $path], $other)['status']);
        $this->assertSame(403, $this->post('/storage/delete', ['url' => $made['body']['publicUrl']], $other)['status']);
        $this->assertSame(400, $this->post('/storage/delete', ['path' => 'avatars/../' . $ownerId . '/nope.jpg'], $owner)['status']);
        $this->assertSame(400, $this->post('/storage/delete', ['url' => 'https://evil.test/' . $path], $owner)['status']);
        $this->assertSame(404, $this->post('/storage/delete', [
            'path' => 'avatars/' . $ownerId . '/' . str_repeat('ab', 16) . '.jpg',
        ], $owner)['status']);

        $gone = $this->post('/storage/delete', ['url' => $made['body']['publicUrl']], $owner);
        $this->assertSame(200, $gone['status']);
        $this->assertTrue($gone['body']['success']);
        $this->assertStringContainsString('X-Amz-Expires=120', (string) $gone['body']['deleteUrl']);
        $this->assertStringContainsString('X-Amz-Signature=', (string) $gone['body']['deleteUrl']);
        $still = Database::run($this->pdo, 'SELECT COUNT(*) FROM storage_objects WHERE object_key = ?', [$path])->fetchColumn();
        $this->assertSame(1, (int) $still);

        $found = $this->post('/storage/upload', [
            'purpose' => 'found',
            'contentType' => 'image/png',
            'contentLength' => 64,
        ], $owner);
        $this->assertSame(200, $found['status']);
        $this->assertStringStartsWith('found-items/' . $ownerId . '/', (string) $found['body']['path']);
        $this->assertStringEndsWith('.png', (string) $found['body']['path']);

        $this->assertSame(403, $this->post('/storage/upload', [
            'purpose' => 'branding',
            'contentType' => 'image/webp',
            'contentLength' => 32,
        ], $owner)['status']);
        $brand = $this->post('/storage/upload', [
            'purpose' => 'branding',
            'contentType' => 'image/webp',
            'contentLength' => 32,
        ], $admin);
        $this->assertSame(200, $brand['status']);
        $this->assertStringStartsWith('branding/' . $adminId . '/', (string) $brand['body']['path']);

        $byAdmin = $this->post('/storage/delete', ['path' => $found['body']['path']], $admin);
        $this->assertSame(200, $byAdmin['status']);
    }

    public function testEditorsAreAdminAndCappedAtFiveMegabytes(): void
    {
        $this->student('30011');
        $adminId = $this->student('30012', 'admin');
        $user = $this->login('30011');
        $admin = $this->login('30012');
        $jpeg = ['contentType' => 'image/jpeg', 'contentLength' => 100];

        $this->assertSame(401, $this->post('/admin/blog/upload', $jpeg)['status']);
        $this->assertSame(403, $this->post('/admin/blog/upload', $jpeg, $user)['status']);
        $this->assertSame(403, $this->post('/admin/help/upload', $jpeg, $user)['status']);
        $this->assertSame(400, $this->post('/admin/blog/upload', [
            'contentType' => 'image/svg+xml',
            'contentLength' => 100,
        ], $admin)['status']);
        $this->assertSame(400, $this->post('/admin/blog/upload', [
            'contentType' => 'image/jpeg',
            'contentLength' => 5242881,
        ], $admin)['status']);
        $this->assertSame(400, $this->post('/storage/upload', [
            'purpose' => 'avatar',
            'contentType' => 'image/gif',
            'contentLength' => 10485761,
        ], $user)['status']);
        $this->assertSame(400, $this->post('/storage/upload', [
            'purpose' => 'blog',
            'contentType' => 'image/jpeg',
            'contentLength' => 100,
        ], $admin)['status']);

        $blog = $this->post('/admin/blog/upload', [
            'contentType' => 'image/gif',
            'contentLength' => 5242880,
        ], $admin);
        $this->assertSame(200, $blog['status']);
        $this->assertMatchesRegularExpression(
            '#^blog/' . preg_quote($adminId, '#') . '/[0-9a-f]{32}\\.gif$#',
            (string) $blog['body']['path']
        );
        $help = $this->post('/admin/help/upload', $jpeg, $admin);
        $this->assertSame(200, $help['status']);
        $this->assertStringStartsWith('help/' . $adminId . '/', (string) $help['body']['path']);

        $this->assertSame(403, $this->post('/storage/delete', ['path' => $blog['body']['path']], $user)['status']);
        $this->assertSame(200, $this->post('/storage/delete', ['path' => $help['body']['path']], $admin)['status']);
    }

    public function testPresignRateLimitIsPerAccount(): void
    {
        putenv('RATE_LIMIT_PRESIGN_PER_HOUR=2');
        $app = Kernel::create(dirname(__DIR__));
        $this->student('30021');
        $this->student('30022');
        $first = $this->login('30021');
        $second = $this->login('30022');
        $body = ['purpose' => 'found', 'contentType' => 'image/jpeg', 'contentLength' => 10];

        $this->assertSame(200, $this->post('/storage/upload', $body, $first, true, $app)['status']);
        $this->assertSame(200, $this->post('/storage/upload', $body, $first, true, $app)['status']);
        $blocked = $this->post('/storage/upload', $body, $first, true, $app);
        $this->assertSame(429, $blocked['status']);
        $this->assertSame('too_many_requests', $blocked['body']['error']);
        $this->assertGreaterThan(0, (int) $this->header($blocked, 'Retry-After'));
        $this->assertSame(200, $this->post('/storage/upload', $body, $second, true, $app)['status']);
    }

    public function testSignedInUploadDoesNotAskForTurnstile(): void
    {
        putenv('TURNSTILE_ENABLED=1');
        putenv('TURNSTILE_SECRET=unit-test-secret');
        $app = Kernel::create(dirname(__DIR__));
        $this->student('30031');
        $user = $this->login('30031');
        $made = $this->post('/storage/upload', [
            'purpose' => 'avatar',
            'contentType' => 'image/jpeg',
            'contentLength' => 20,
        ], $user, true, $app);
        $this->assertSame(200, $made['status'], $made['raw']);
    }

    public function testHttpEndpointIsRefusedOutsideLocal(): void
    {
        putenv('APP_ENV=production');
        putenv('R2_ENDPOINT=http://127.0.0.1:9000');
        $app = Kernel::create(dirname(__DIR__));
        $this->student('30041');
        $user = $this->login('30041');
        $made = $this->post('/storage/upload', [
            'purpose' => 'avatar',
            'contentType' => 'image/jpeg',
            'contentLength' => 20,
        ], $user, true, $app);
        $this->assertSame(503, $made['status']);
        $this->assertSame('storage_unconfigured', $made['body']['error']);
    }

    public function testBadBucketIsUnconfigured(): void
    {
        putenv('R2_BUCKET_NAME=Bad_Bucket');
        $app = Kernel::create(dirname(__DIR__));
        $this->student('30051');
        $user = $this->login('30051');
        $made = $this->post('/storage/upload', [
            'purpose' => 'avatar',
            'contentType' => 'image/jpeg',
            'contentLength' => 20,
        ], $user, true, $app);
        $this->assertSame(503, $made['status']);
        $this->assertSame('storage_unconfigured', $made['body']['error']);
    }

    private function assertSignedPut(string $url, string $type, int $bytes): void
    {
        $parts = parse_url($url);
        $this->assertIsArray($parts);
        parse_str((string) ($parts['query'] ?? ''), $params);
        $again = SigV4::presign(
            'PUT',
            (string) $parts['host'],
            (string) $parts['path'],
            self::ACCESS,
            self::SECRET,
            'auto',
            ['content-type' => $type, 'content-length' => (string) $bytes],
            300,
            (string) $params['X-Amz-Date']
        );
        $this->assertSame($again, $parts['query']);
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
        $this->assertSame(200, $result['status'], $result['raw']);
        return $result['cookies'];
    }

    private function post(string $path, array $json, array $cookies = [], bool $csrf = true, ?App $app = null): array
    {
        return $this->call('POST', $path, $json, $cookies, $csrf, $app);
    }

    private function call(string $method, string $path, ?array $json, array $cookies, bool $csrf, ?App $app): array
    {
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
