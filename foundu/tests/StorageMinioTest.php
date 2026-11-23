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

// One real PUT against the compose MinIO profile. Skipped unless
// FOUNDU_MINIO=1, so the default suite does not need the container.
final class StorageMinioTest extends DbTestCase
{
    private const ENDPOINT = 'http://minio:9000';
    private const BUCKET = 'foundu-test';
    private const ACCESS = 'foundu';
    private const SECRET = 'foundu-dev-secret';

    private App $app;

    private int $ip = 80;

    protected function setUp(): void
    {
        if (getenv('FOUNDU_MINIO') !== '1') {
            $this->markTestSkipped('Set FOUNDU_MINIO=1 and start the minio compose profile.');
        }
        putenv('APP_ENV=local');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('RATE_LIMIT_PRESIGN_PER_HOUR=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('R2_ACCOUNT_ID=minio');
        putenv('R2_ACCESS_KEY_ID=' . self::ACCESS);
        putenv('R2_SECRET_ACCESS_KEY=' . self::SECRET);
        putenv('R2_BUCKET_NAME=' . self::BUCKET);
        putenv('R2_PUBLIC_BASE_URL=' . self::ENDPOINT);
        putenv('R2_ENDPOINT=' . self::ENDPOINT);
        putenv('R2_REGION=us-east-1');
        parent::setUp();
        $this->app = Kernel::create(dirname(__DIR__));
    }

    public function testPutAndDeleteRoundTrip(): void
    {
        $this->createBucket();
        $this->student('30061');
        $user = $this->login('30061');
        $bytes = "\xff\xd8\xff\xd9";
        $made = $this->post('/storage/upload', [
            'purpose' => 'found',
            'contentType' => 'image/jpeg',
            'contentLength' => strlen($bytes),
        ], $user);
        $this->assertSame(200, $made['status'], $made['raw']);
        $path = (string) $made['body']['path'];

        $put = $this->curl((string) $made['body']['uploadUrl'], 'PUT', $bytes, [
            'Content-Type: image/jpeg',
            'Content-Length: ' . strlen($bytes),
        ]);
        $this->assertContains($put['status'], [200, 204], $put['raw']);

        $got = $this->curl($this->signed('GET', $path), 'GET');
        $this->assertSame(200, $got['status'], $got['raw']);
        $this->assertSame($bytes, $got['body']);

        $deleted = $this->post('/storage/delete', ['path' => $path], $user);
        $this->assertSame(200, $deleted['status'], $deleted['raw']);
        $drop = $this->curl((string) $deleted['body']['deleteUrl'], 'DELETE');
        $this->assertContains($drop['status'], [200, 204], $drop['raw']);

        $missing = $this->curl($this->signed('GET', $path), 'GET');
        $this->assertSame(404, $missing['status'], $missing['raw']);
    }

    private function createBucket(): void
    {
        $amz = gmdate('Ymd\THis\Z');
        $hash = hash('sha256', '');
        $auth = SigV4::authorization(
            'PUT',
            '/' . self::BUCKET,
            '',
            'minio:9000',
            [
                'content-length' => '0',
                'x-amz-content-sha256' => $hash,
                'x-amz-date' => $amz,
            ],
            $hash,
            self::ACCESS,
            self::SECRET,
            'us-east-1',
            $amz
        );
        $result = $this->curl(self::ENDPOINT . '/' . self::BUCKET, 'PUT', '', [
            'Authorization: ' . $auth,
            'Content-Length: 0',
            'x-amz-content-sha256: ' . $hash,
            'x-amz-date: ' . $amz,
        ]);
        $this->assertContains($result['status'], [200, 409], $result['raw']);
    }

    private function signed(string $method, string $key): string
    {
        $uri = SigV4::encodePath('/' . self::BUCKET . '/' . $key);
        $amz = gmdate('Ymd\THis\Z');
        $query = SigV4::presign($method, 'minio:9000', $uri, self::ACCESS, self::SECRET, 'us-east-1', [], 120, $amz);
        return self::ENDPOINT . $uri . '?' . $query;
    }

    private function curl(string $url, string $method, string $body = '', array $headers = []): array
    {
        $ch = curl_init($url);
        $this->assertNotFalse($ch);
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_HTTPHEADER => array_merge(['Expect:'], $headers),
            CURLOPT_TIMEOUT => 10,
        ];
        if ($method === 'PUT') {
            $options[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        $this->assertIsString($raw);
        return [
            'status' => $status,
            'body' => substr($raw, $headerSize),
            'raw' => $raw,
        ];
    }

    private function student(string $studentId): string
    {
        $id = Ids::uuid();
        $hash = PasswordHash::hash('Password1');
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $studentId, $hash): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, nickname, role, status, ban_status,
                    is_student_verified, is_registered, has_logged_in_once, current_password_hash,
                    auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, \'user\', \'active\', \'none\', 1, 1, 1, ?, JSON_ARRAY(\'password\'), JSON_ARRAY())',
                [$id, $studentId, $id, $studentId . '@students.school.test', 'ทดสอบ', 'ทดสอบ', $hash]
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

    private function post(string $path, array $json, array $cookies = []): array
    {
        $this->ip++;
        $server = [
            'REMOTE_ADDR' => '203.0.113.' . $this->ip,
            'REQUEST_URI' => '/api' . $path,
            'HTTPS' => '',
        ];
        $headers = ['Content-Type' => 'application/json'];
        if (isset($cookies['foundu_csrf'])) {
            $headers['X-CSRF-Token'] = $cookies['foundu_csrf'];
        }
        $request = (new ServerRequestFactory())->createServerRequest('POST', 'http://localhost:8080/api' . $path, $server);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($cookies !== []) {
            $request = $request->withCookieParams($cookies);
        }
        $request->getBody()->write(json_encode($json, JSON_THROW_ON_ERROR));
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
