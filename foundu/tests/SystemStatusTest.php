<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\PasswordHash;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Install\Migrator;
use Foundu\Kernel;
use PDO;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class SystemStatusTest extends DbTestCase
{
    private App $app;

    private int $ip = 40;

    private string $chunkDir = '';

    protected function setUp(): void
    {
        putenv('RATE_LIMIT_AUTH_PER_MINUTE=100000');
        putenv('RATE_LIMIT_API_PER_MINUTE=100000');
        putenv('TURNSTILE_ENABLED=0');
        putenv('APP_URL=http://localhost:8080');
        putenv('APP_KEY=unit-test-app-key-32-bytes-minimum!!');
        putenv('SCHOOL_AUTH_DOMAIN=school.test');
        putenv('SIGNUPS_ENABLED=0');
        putenv('GEMINI_API_KEY=super-secret-gemini-value');
        putenv('TURNSTILE_SECRET=super-secret-turnstile');
        putenv('R2_SECRET_ACCESS_KEY=super-secret-r2');
        parent::setUp();
        $this->app = Kernel::create(dirname(__DIR__));
    }

    protected function tearDown(): void
    {
        if ($this->chunkDir !== '') {
            $this->pdo->exec('DROP TABLE IF EXISTS install_chunk_probe');
            $this->pdo->exec("DELETE FROM schema_migrations WHERE filename = '901_install_chunk.sql'");
            $this->remove($this->chunkDir);
        }
        foreach ([
            'RATE_LIMIT_AUTH_PER_MINUTE',
            'RATE_LIMIT_API_PER_MINUTE',
            'TURNSTILE_ENABLED',
            'SIGNUPS_ENABLED',
            'GEMINI_API_KEY',
            'TURNSTILE_SECRET',
            'R2_SECRET_ACCESS_KEY',
        ] as $name) {
            putenv($name);
        }
        parent::tearDown();
    }

    public function testImportResumesInsideAFile(): void
    {
        $this->chunkDir = sys_get_temp_dir() . '/foundu-chunk-' . bin2hex(random_bytes(4));
        mkdir($this->chunkDir, 0700, true);
        file_put_contents($this->chunkDir . '/901_install_chunk.sql', <<<'SQL'
CREATE TABLE IF NOT EXISTS install_chunk_probe (id INT PRIMARY KEY);
INSERT INTO install_chunk_probe (id) VALUES (1);
INSERT INTO install_chunk_probe (id) VALUES (2);
SQL);
        $progress = $this->chunkDir . '/progress.json';
        $deadline = time() + 30;

        $first = Migrator::advance($this->pdo, $this->chunkDir, $progress, $deadline, 1);
        $this->assertFalse($first['done']);
        $this->assertSame(1, $first['ran']);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM install_chunk_probe')->fetchColumn());

        $second = Migrator::advance($this->pdo, $this->chunkDir, $progress, $deadline, 1);
        $this->assertFalse($second['done']);
        $this->assertSame(1, $second['ran']);
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM install_chunk_probe')->fetchColumn());

        $third = Migrator::advance($this->pdo, $this->chunkDir, $progress, $deadline, 1);
        $this->assertTrue($third['done']);
        $this->assertSame([], $third['pending']);
        $this->assertSame(2, (int) $this->pdo->query('SELECT COUNT(*) FROM install_chunk_probe')->fetchColumn());

        $again = Migrator::advance($this->pdo, $this->chunkDir, $progress, $deadline, 5);
        $this->assertTrue($again['done']);
        $this->assertSame(0, $again['ran']);
        $this->assertSame(2, (int) $this->pdo->query('SELECT COUNT(*) FROM install_chunk_probe')->fetchColumn());
    }

    public function testImportStopsWhenTheDeadlineHasPassed(): void
    {
        $this->chunkDir = sys_get_temp_dir() . '/foundu-chunk-' . bin2hex(random_bytes(4));
        mkdir($this->chunkDir, 0700, true);
        file_put_contents(
            $this->chunkDir . '/901_install_chunk.sql',
            "CREATE TABLE IF NOT EXISTS install_chunk_probe (id INT PRIMARY KEY);\n"
        );
        $result = Migrator::advance($this->pdo, $this->chunkDir, $this->chunkDir . '/progress.json', time() - 1, 0);
        $this->assertFalse($result['done']);
        $this->assertSame(0, $result['ran']);
        $this->pdo->exec('DROP TABLE IF EXISTS install_chunk_probe');
    }

    public function testStatusIsAdminOnlyAndHidesSecrets(): void
    {
        $this->student('33001');
        $this->student('33002', 'admin');
        $user = $this->login('33001');
        $admin = $this->login('33002');

        $this->assertSame(401, $this->call('GET', '/admin/system-status', null)['status']);
        $this->assertSame(403, $this->call('GET', '/admin/system-status', null, $user)['status']);
        $this->assertSame(401, $this->call('POST', '/admin/system-status/migrations', [])['status']);
        $this->assertSame(403, $this->call('POST', '/admin/system-status/migrations', [], $user)['status']);

        $id = Ids::uuid();
        Database::run(
            $this->pdo,
            "INSERT INTO error_logs (id, message, severity, source) VALUES (?, 'status probe', 'low', 'server')",
            [$id]
        );

        $page = $this->call('GET', '/admin/system-status', null, $admin);
        $this->assertSame(200, $page['status']);
        $raw = (string) $page['raw'];
        $this->assertStringNotContainsString('super-secret-gemini-value', $raw);
        $this->assertStringNotContainsString('super-secret-turnstile', $raw);
        $this->assertStringNotContainsString('super-secret-r2', $raw);
        $this->assertStringNotContainsString('unit-test-app-key', $raw);
        $this->assertSame(PHP_VERSION, $page['body']['php']['version']);
        $this->assertFalse($page['body']['config']['signupsEnabled']);
        $this->assertTrue($page['body']['config']['ai']);
        $this->assertTrue($page['body']['extensions']['pdo_mysql']);
        $this->assertGreaterThanOrEqual(1, $page['body']['errors']['recent']);
        if (PHP_VERSION_ID >= 80300) {
            $this->assertNull($page['body']['php']['eol']);
        } else {
            $this->assertIsString($page['body']['php']['eol']);
        }

        $ran = $this->call('POST', '/admin/system-status/migrations', [], $admin);
        $this->assertSame(200, $ran['status']);
        $this->assertTrue($ran['body']['done']);
        $this->assertIsArray($ran['body']['pending']);
    }

    private function student(string $studentId, string $role = 'user'): void
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
    }

    /**
     * @return array<string, string>
     */
    private function login(string $studentId): array
    {
        $result = $this->call('POST', '/auth/login', ['studentId' => $studentId, 'password' => 'Password1']);
        $this->assertSame(200, $result['status']);
        return $result['cookies'];
    }

    /**
     * @param array<string, mixed>|null $json
     * @param array<string, string> $cookies
     * @return array{status: int, body: array<string, mixed>, cookies: array<string, string>, raw: string}
     */
    private function call(string $method, string $path, ?array $json, array $cookies = []): array
    {
        $this->ip++;
        $headers = ['Content-Type' => 'application/json'];
        if (isset($cookies['foundu_csrf'])) {
            $headers['X-CSRF-Token'] = $cookies['foundu_csrf'];
        }
        $request = (new ServerRequestFactory())->createServerRequest($method, 'http://localhost:8080/api' . $path, [
            'REMOTE_ADDR' => '203.0.113.' . $this->ip,
            'REQUEST_URI' => '/api' . $path,
            'HTTPS' => '',
        ]);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($cookies !== []) {
            $request = $request->withCookieParams($cookies);
        }
        if ($json !== null) {
            $request->getBody()->write($json === [] ? '{}' : json_encode($json, JSON_THROW_ON_ERROR));
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
            'cookies' => $jar,
            'raw' => $raw,
        ];
    }

    private function remove(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $full = $path . '/' . $name;
            if (is_dir($full)) {
                $this->remove($full);
            } else {
                @unlink($full);
            }
        }
        @rmdir($path);
    }
}
