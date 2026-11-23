<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\AccountWriter;
use Foundu\Auth\PasswordHash;
use Foundu\Auth\SessionService;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Kernel;
use PDO;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class AuthHttpTest extends DbTestCase
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
        $this->app = Kernel::create(dirname(__DIR__));
    }

    public function testPasswordLoginAdminAndWrongPassword(): void
    {
        $this->student('10001', 'Password1', 'user', '123456');
        $this->student('11111', 'Adminpass1', 'admin');

        $missing = $this->post('/auth/login', ['studentId' => '99999', 'password' => 'Password1']);
        $wrong = $this->post('/auth/login', ['studentId' => '10001', 'password' => 'Nopepass1']);
        $this->assertSame(401, $missing['status']);
        $this->assertSame(401, $wrong['status']);
        $this->assertSame($missing['body']['error'], $wrong['body']['error']);
        $this->assertArrayNotHasKey('needsRegistration', $wrong['body']);

        $ok = $this->post('/auth/login', ['studentId' => '10001', 'password' => 'Password1']);
        $this->assertSame(200, $ok['status']);
        $this->assertNotSame('', $ok['body']['access_token']);
        $this->assertSame($ok['body']['access_token'], $ok['body']['refresh_token']);
        $this->assertFalse($ok['body']['mustSetupPin']);
        $this->assertSame('10001', $ok['body']['studentId']);
        $this->assertArrayHasKey('foundu', $ok['cookies']);

        $admin = $this->post('/auth/login', ['studentId' => '11111', 'password' => 'Adminpass1']);
        $this->assertSame(200, $admin['status']);
        $status = $this->get('/auth/session-status', $admin['cookies']);
        $this->assertSame(200, $status['status']);
        $this->assertTrue($status['body']['isAdmin']);
        $this->assertSame('admin', $status['body']['role']);
    }

    public function testLockoutAfterFiveFailures(): void
    {
        $this->student('10002', 'Password1');
        $last = [];
        for ($i = 0; $i < 5; $i++) {
            $last = $this->post('/auth/login', ['studentId' => '10002', 'password' => 'Nopepass1']);
            $this->assertSame(401, $last['status']);
        }
        $locked = $this->post('/auth/login', ['studentId' => '10002', 'password' => 'Password1']);
        $this->assertSame(429, $locked['status']);
        $this->assertArrayHasKey('retryAfterMs', $locked['body']);
        $this->assertNotSame('', $locked['headers']['Retry-After'] ?? '');
        $this->assertGreaterThan(0, $locked['body']['retryAfterMs']);
    }

    public function testBannedUserLosesEverySession(): void
    {
        $id = $this->student('10003', 'Password1');
        $login = $this->post('/auth/login', ['studentId' => '10003', 'password' => 'Password1']);
        $this->assertSame(200, $login['status']);
        AccountWriter::setBan($this->pdo, new SessionService(1800, 43200), $id, 'banned', 'ทดสอบ', null, null, false, time());
        $again = $this->get('/auth/session-status', $login['cookies']);
        $this->assertSame(401, $again['status']);
        $denied = $this->post('/auth/login', ['studentId' => '10003', 'password' => 'Password1']);
        $this->assertSame(401, $denied['status']);
        $this->assertSame('เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง', $denied['body']['error']);
        $revoked = Database::run(
            $this->pdo,
            'SELECT COUNT(*) FROM sessions WHERE account_id = ? AND revoked_at IS NULL AND kind = \'browser\'',
            [$id]
        )->fetchColumn();
        $this->assertSame(0, (int) $revoked);
    }

    public function testCsrfMissingAndTurnstileFailsClosed(): void
    {
        $this->student('10004', 'Password1');
        $login = $this->post('/auth/login', ['studentId' => '10004', 'password' => 'Password1']);
        $noCsrf = $this->call('POST', '/auth/change-password', [
            'currentPassword' => 'Password1',
            'newPassword' => 'Password2',
        ], $login['cookies'], false);
        $this->assertSame(403, $noCsrf['status']);
        $this->assertSame('csrf', $noCsrf['body']['error']);

        putenv('TURNSTILE_ENABLED=1');
        putenv('TURNSTILE_SECRET=unit-test-secret');
        try {
            $app = Kernel::create(dirname(__DIR__));
            $closed = $this->call('POST', '/auth/login', [
                'studentId' => '10004',
                'password' => 'Password1',
            ], [], true, $app);
            $this->assertSame(400, $closed['status']);
            $this->assertSame('ยืนยันว่าไม่ใช่บอทไม่ผ่าน', $closed['body']['error']);
        } finally {
            putenv('TURNSTILE_ENABLED=0');
            putenv('TURNSTILE_SECRET');
        }
    }

    public function testRegisterResetPinAndLogout(): void
    {
        $this->roster('10005', 'สมชาย', 'ใจดี');
        $lookup = $this->get('/auth/register/lookup?studentId=10005');
        $this->assertSame(200, $lookup['status']);
        $this->assertTrue($lookup['body']['canRegister']);
        $done = $this->post('/auth/register/complete', [
            'studentId' => '10005',
            'registrationToken' => $lookup['body']['registrationToken'],
            'password' => 'Password1',
            'pin' => '654321',
        ]);
        $this->assertSame(200, $done['status']);
        $this->assertFalse($done['body']['mustSetupPin']);

        $this->post('/auth/logout', [], $done['cookies']);
        $dead = $this->get('/auth/session-status', $done['cookies']);
        $this->assertSame(401, $dead['status']);

        $reset = $this->post('/auth/reset-password-with-pin', [
            'studentId' => '10005',
            'pin' => '654321',
            'newPassword' => 'Password2',
        ]);
        $this->assertSame(200, $reset['status']);
        $this->assertFalse($reset['body']['mustChangePassword']);
        $old = $this->post('/auth/login', ['studentId' => '10005', 'password' => 'Password1']);
        $this->assertSame(401, $old['status']);
        $now = $this->post('/auth/login', ['studentId' => '10005', 'password' => 'Password2']);
        $this->assertSame(200, $now['status']);
    }

    public function testStudentCannotCallAdminRoutes(): void
    {
        $this->student('10006', 'Password1');
        $this->student('10007', 'Password1', 'admin');
        $user = $this->post('/auth/login', ['studentId' => '10006', 'password' => 'Password1']);
        $guest = $this->post('/admin/students/create', [
            'studentId' => '22222',
            'firstName' => 'เอ',
            'lastName' => 'บี',
        ]);
        $this->assertSame(401, $guest['status']);
        $denied = $this->post('/admin/students/create', [
            'studentId' => '22222',
            'firstName' => 'เอ',
            'lastName' => 'บี',
        ], $user['cookies']);
        $this->assertSame(403, $denied['status']);
        $whitelist = $this->get('/admin/whitelist', $user['cookies']);
        $this->assertSame(403, $whitelist['status']);

        $admin = $this->post('/auth/login', ['studentId' => '10007', 'password' => 'Password1']);
        $created = $this->post('/admin/students/create', [
            'studentId' => '22222',
            'firstName' => 'เอ',
            'lastName' => 'บี',
            'gradeLevel' => 'ม.4',
            'roomNumber' => '1',
        ], $admin['cookies']);
        $this->assertSame(200, $created['status']);
        $this->assertSame('user', $created['body']['role']);
        $import = $this->post('/admin/students/import', [
            'csvContent' => "33333:ม.1/2:นารี ศรีสุข\n",
            'dryRun' => true,
        ], $admin['cookies']);
        $this->assertSame(200, $import['status']);
        $this->assertTrue($import['body']['dryRun']);
        $this->assertSame(1, $import['body']['previewCount']);
    }

    public function testPasskeyRegisterAndLogin(): void
    {
        $this->student('10008', 'Password1', 'user', '123456');
        $login = $this->post('/auth/login', ['studentId' => '10008', 'password' => 'Password1']);
        $options = $this->post('/auth/passkey/register', [], $login['cookies']);
        $this->assertSame(200, $options['status']);
        $this->assertSame('localhost', $options['body']['options']['rp']['id']);
        $authenticator = VirtualPasskey::generate();
        $registered = $this->call('PUT', '/auth/passkey/register', [
            'challengeKey' => $options['body']['challengeKey'],
            'response' => $authenticator->register(
                $options['body']['options']['challenge'],
                'http://localhost:8080',
                'localhost'
            ),
        ], $options['cookies']);
        $this->assertSame(200, $registered['status'], json_encode($registered['body'], JSON_UNESCAPED_UNICODE));
        $count = $this->get('/auth/passkey/register', $registered['cookies']);
        $this->assertTrue($count['body']['hasPasskey']);
        $this->assertSame(1, $count['body']['count']);

        $start = $this->post('/auth/passkey/login', ['studentId' => '10008']);
        $this->assertSame(200, $start['status']);
        $signed = $this->call('PUT', '/auth/passkey/login', [
            'challengeKey' => $start['body']['challengeKey'],
            'studentId' => '10008',
            'response' => $authenticator->login(
                $start['body']['options']['challenge'],
                'http://localhost:8080',
                'localhost',
                '10008'
            ),
        ]);
        $this->assertSame(200, $signed['status'], json_encode($signed['body'], JSON_UNESCAPED_UNICODE));
        $this->assertSame('10008', $signed['body']['studentId']);
        $this->assertArrayHasKey('foundu', $signed['cookies']);
    }

    public function testRehashOnLoginAndDroppedRoutes(): void
    {
        $id = Ids::uuid();
        $bcrypt = password_hash('Password1', PASSWORD_BCRYPT);
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $bcrypt): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, nickname, role, status, ban_status,
                    is_student_verified, is_registered, has_logged_in_once, current_password_hash,
                    auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, \'user\', \'active\', \'none\', 1, 1, 1, ?, JSON_ARRAY(\'password\'), JSON_ARRAY())',
                [$id, '10009', $id, '10009@students.school.test', 'รีแฮช', 'รี', $bcrypt]
            );
        });
        $login = $this->post('/auth/login', ['studentId' => '10009', 'password' => 'Password1']);
        $this->assertSame(200, $login['status']);
        $hash = Database::run($this->pdo, 'SELECT current_password_hash FROM accounts WHERE id = ?', [$id])->fetchColumn();
        $this->assertIsString($hash);
        $this->assertStringStartsWith('$argon2id$', $hash);
        $this->assertTrue(password_verify('Password1', $hash));

        $gone = $this->get('/auth/callback');
        $this->assertSame(404, $gone['status']);
    }

    public function testRemainingAuthRoutes(): void
    {
        $this->roster('10010', 'มานี', 'มีตา');
        $needs = $this->post('/auth/login', ['studentId' => '10010', 'password' => 'Password1']);
        $this->assertSame(401, $needs['status']);
        $this->assertTrue($needs['body']['needsRegistration']);

        $id = $this->student('10011', 'Password1');
        $login = $this->post('/auth/login', ['studentId' => '10011', 'password' => 'Password1']);
        $pin = $this->post('/auth/pin/setup', ['pin' => '246810'], $login['cookies']);
        $this->assertSame(200, $pin['status']);
        $verified = $this->post('/auth/verify-password', ['password' => 'Password1'], $pin['cookies']);
        $this->assertSame(200, $verified['status']);
        $pinOk = $this->post('/auth/verify-pin', ['pin' => '246810'], $pin['cookies']);
        $this->assertSame(200, $pinOk['status']);
        $pinLogin = $this->post('/auth/pin/login', ['studentId' => '10011', 'pin' => '246810']);
        $this->assertSame(200, $pinLogin['status']);
        $eligible = $this->get('/auth/eligibility', $pinLogin['cookies']);
        $this->assertTrue($eligible['body']['eligible']);
        $device = $this->get('/auth/device-profile?studentId=10011');
        $this->assertTrue($device['body']['exists']);
        $this->assertTrue($device['body']['quickUnlockAvailable']);

        $school = PasswordHash::hash('school12');
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $school): void {
            Database::run($pdo, 'UPDATE accounts SET school_password_hash = ? WHERE id = ?', [$school, $id]);
        });
        $reset = $this->post('/auth/reset-password', [
            'studentId' => '10011',
            'schoolPassword' => 'school12',
            'newPassword' => 'Password3',
        ]);
        $this->assertSame(200, $reset['status']);

        $adminId = $this->student('10012', 'Password1', 'admin');
        $admin = $this->post('/auth/login', ['studentId' => '10012', 'password' => 'Password1']);
        $added = $this->post('/admin/whitelist', ['email' => '10011@students.school.test', 'note' => 'lab'], $admin['cookies']);
        $this->assertSame(200, $added['status']);
        $student = $this->post('/auth/login', ['studentId' => '10011', 'password' => 'Password3']);
        $promoted = $this->get('/auth/session-status', $student['cookies']);
        $this->assertTrue($promoted['body']['whitelisted']);
        $this->assertTrue($promoted['body']['isAdmin']);
        $list = $this->get('/admin/whitelist', $promoted['cookies']);
        $this->assertSame(200, $list['status']);
        $removed = $this->call('DELETE', '/admin/whitelist?email=10011@students.school.test', null, $list['cookies']);
        $this->assertSame(200, $removed['status']);

        $options = $this->post('/auth/passkey/register', [], $admin['cookies']);
        $authenticator = VirtualPasskey::generate();
        $registered = $this->call('PUT', '/auth/passkey/register', [
            'challengeKey' => $options['body']['challengeKey'],
            'response' => $authenticator->register($options['body']['options']['challenge'], 'http://localhost:8080', 'localhost'),
        ], $options['cookies']);
        $this->assertSame(200, $registered['status']);
        $sync = $this->post('/auth/passkey/sync-profile', [], $registered['cookies']);
        $this->assertSame(200, $sync['status']);
        $cleared = $this->call('DELETE', '/auth/passkey/sync-profile', null, $sync['cookies']);
        $this->assertSame(200, $cleared['status']);
        $gone = $this->call('DELETE', '/auth/passkey/register', null, $cleared['cookies']);
        $this->assertSame(200, $gone['status']);
        $this->assertFalse($this->get('/auth/passkey/register', $gone['cookies'])['body']['hasPasskey']);

        $wiped = $this->post('/admin/students/reset-account', ['studentId' => '10011'], $admin['cookies']);
        $this->assertSame(200, $wiped['status']);
        $after = $this->post('/auth/login', ['studentId' => '10011', 'password' => 'Password3']);
        $this->assertTrue($after['body']['needsRegistration'] ?? false);

        Database::privileged($this->pdo, function (PDO $pdo) use ($adminId): void {
            Database::run($pdo, 'UPDATE accounts SET ban_status = \'banned\', ban_reason = \'ดูหน้าแบน\' WHERE id = ?', [$adminId]);
        });
        $page = $this->get('/auth/banned', $admin['cookies']);
        $this->assertSame(200, $page['status']);
        $this->assertSame('banned', $page['body']['banStatus']);
        $this->assertSame(401, $this->get('/auth/session-status', $admin['cookies'])['status']);
    }

    private function student(string $studentId, string $password, string $role = 'user', ?string $pin = null): string
    {
        $id = Ids::uuid();
        $hash = PasswordHash::hash($password);
        $pinHash = $pin === null ? null : PasswordHash::hash($pin);
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $studentId, $role, $hash, $pinHash): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, nickname, role, status, ban_status,
                    is_student_verified, is_registered, has_logged_in_once, current_password_hash, pin_hash,
                    auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, \'active\', \'none\', 1, 1, 1, ?, ?, JSON_ARRAY(\'password\'), JSON_ARRAY())',
                [$id, $studentId, $id, $studentId . '@students.school.test', 'ทดสอบ', 'ทดสอบ', $role, $hash, $pinHash]
            );
        });
        return $id;
    }

    private function roster(string $studentId, string $first, string $last): void
    {
        $id = Ids::uuid();
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $studentId, $first, $last): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, first_name, last_name, nickname,
                    role, status, ban_status, is_registered, has_logged_in_once, auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'user\', \'active\', \'none\', 0, 0, JSON_ARRAY(), JSON_ARRAY())',
                [$id, $studentId, $id, $studentId . '@students.school.test', $first . ' ' . $last, $first, $last, $first]
            );
        });
    }

    private function post(string $path, array $json, array $cookies = []): array
    {
        return $this->call('POST', $path, $json, $cookies);
    }

    private function get(string $path, array $cookies = []): array
    {
        return $this->call('GET', $path, null, $cookies);
    }

    private function call(string $method, string $path, ?array $json, array $cookies = [], bool $csrf = true, ?App $app = null): array
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
        $uri = 'http://localhost:8080/api' . $path;
        $request = (new ServerRequestFactory())->createServerRequest($method, $uri, $server);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($cookies !== []) {
            $request = $request->withCookieParams($cookies);
        }
        if ($json !== null) {
            $request->getBody()->write(json_encode($json, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        }
        $response = ($app ?? $this->app)->handle($request);
        $body = json_decode((string) $response->getBody(), true);
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
            'cookies' => $jar,
            'headers' => $headersOut,
        ];
    }
}
