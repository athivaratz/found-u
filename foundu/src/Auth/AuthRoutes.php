<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\ClientAddress;
use Foundu\Http\HttpError;
use Foundu\Http\Https;
use Foundu\Http\Json;
use Foundu\Ids;
use Foundu\Log;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Throwable;

// The auth surface from the contract. Login, register, and password reset
// ask Turnstile. Password and PIN failures go through LoginLockout.
// A new session is issued and then rotated, so the cookie the browser keeps
// is not the one created a statement earlier.
final class AuthRoutes
{
    private const LOGIN_ERROR = 'เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง';
    private const PIN_ERROR = 'เลขประจำตัวหรือ PIN ไม่ถูกต้อง';
    private const LOCK_ERROR = 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่';
    private const SLOW_ERROR = 'ลองบ่อยเกินไป กรุณารอสักครู่';

    public static function register(App $app, array $config, \Closure $pdo, SessionService $sessions): void
    {
        $turnstile = Turnstile::fromConfig($config);
        $lockout = LoginLockout::fromConfig($config);
        $limiter = Limiter::open();

        $app->post('/auth/login', static function ($request, $response) use ($config, $pdo, $sessions, $turnstile, $lockout) {
            return self::guard($request, $response, 'เข้าสู่ระบบไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $turnstile, $lockout) {
                return self::passwordLogin($request, $response, $config, self::db($pdo), $sessions, $turnstile, $lockout);
            });
        });
        $app->post('/auth/pin/login', static function ($request, $response) use ($config, $pdo, $sessions, $turnstile, $lockout) {
            return self::guard($request, $response, 'เข้าสู่ระบบไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $turnstile, $lockout) {
                return self::pinLogin($request, $response, $config, self::db($pdo), $sessions, $turnstile, $lockout);
            });
        });
        $app->post('/auth/pin/setup', static function ($request, $response) use ($config, $pdo, $sessions, $lockout) {
            return self::guard($request, $response, 'ตั้ง PIN ไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $lockout) {
                return self::pinSetup($request, $response, $config, self::db($pdo), $sessions, $lockout);
            });
        });
        $app->get('/auth/register/lookup', static function ($request, $response) use ($config, $pdo, $turnstile, $limiter) {
            return self::guard($request, $response, 'ค้นหาข้อมูลไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $turnstile, $limiter) {
                return self::lookup($request, $response, $config, self::db($pdo), $turnstile, $limiter);
            });
        });
        $app->post('/auth/register/complete', static function ($request, $response) use ($config, $pdo, $sessions, $turnstile, $lockout) {
            return self::guard($request, $response, 'สมัครสมาชิกไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $turnstile, $lockout) {
                return self::complete($request, $response, $config, self::db($pdo), $sessions, $turnstile, $lockout);
            });
        });
        $app->post('/auth/reset-password', static function ($request, $response) use ($config, $pdo, $sessions, $turnstile, $lockout) {
            return self::guard($request, $response, 'รีเซ็ตรหัสผ่านไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $turnstile, $lockout) {
                return self::resetWithSchool($request, $response, $config, self::db($pdo), $sessions, $turnstile, $lockout);
            });
        });
        $app->post('/auth/reset-password-with-pin', static function ($request, $response) use ($config, $pdo, $sessions, $turnstile, $lockout) {
            return self::guard($request, $response, 'รีเซ็ตรหัสผ่านไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $turnstile, $lockout) {
                return self::resetWithPin($request, $response, $config, self::db($pdo), $sessions, $turnstile, $lockout);
            });
        });
        $app->post('/auth/change-password', static function ($request, $response) use ($config, $pdo, $sessions, $lockout) {
            return self::guard($request, $response, 'เปลี่ยนรหัสผ่านไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $lockout) {
                return self::changePassword($request, $response, $config, self::db($pdo), $sessions, $lockout);
            });
        });
        $app->post('/auth/verify-password', static function ($request, $response) use ($pdo, $lockout) {
            return self::guard($request, $response, 'ตรวจสอบรหัสผ่านไม่สำเร็จ', static function () use ($request, $response, $pdo, $lockout) {
                return self::verifyPassword($request, $response, self::db($pdo), $lockout);
            });
        });
        $app->post('/auth/verify-pin', static function ($request, $response) use ($pdo, $lockout) {
            return self::guard($request, $response, 'ตรวจสอบ PIN ไม่สำเร็จ', static function () use ($request, $response, $pdo, $lockout) {
                return self::verifyPin($request, $response, self::db($pdo), $lockout);
            });
        });
        $app->get('/auth/session-status', static function ($request, $response) use ($config, $pdo, $sessions) {
            return self::guard($request, $response, 'ไม่สามารถอ่านเซสชัน', static function () use ($request, $response, $config, $pdo, $sessions) {
                return self::sessionStatus($request, $response, $config, self::db($pdo), $sessions);
            });
        });
        $app->get('/auth/eligibility', static function ($request, $response) use ($pdo) {
            return self::guard($request, $response, 'ไม่สามารถตรวจสอบสิทธิ์', static function () use ($request, $response, $pdo) {
                return self::eligibility($request, $response, self::db($pdo));
            });
        });
        $app->get('/auth/device-profile', static function ($request, $response) use ($pdo, $limiter) {
            return self::guard($request, $response, 'ไม่สามารถอ่านโปรไฟล์', static function () use ($request, $response, $pdo, $limiter) {
                return self::deviceProfile($request, $response, self::db($pdo), $limiter);
            });
        });
        $app->get('/auth/banned', static function ($request, $response) use ($pdo) {
            return self::guard($request, $response, 'ไม่สามารถอ่านสถานะ', static function () use ($request, $response, $pdo) {
                return self::banned($request, $response, self::db($pdo));
            });
        });
        $app->post('/auth/logout', static function ($request, $response) use ($config, $pdo, $sessions) {
            return self::guard($request, $response, 'ออกจากระบบไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions) {
                return self::logout($request, $response, $config, self::db($pdo), $sessions);
            });
        });

        $app->post('/auth/passkey/login', static function ($request, $response) use ($config, $pdo, $turnstile) {
            return self::guard($request, $response, 'ไม่สามารถเริ่ม PassKey login', static function () use ($request, $response, $config, $pdo, $turnstile) {
                return self::passkeyOptions($request, $response, $config, self::db($pdo), $turnstile);
            });
        });
        $app->put('/auth/passkey/login', static function ($request, $response) use ($config, $pdo, $sessions, $lockout) {
            return self::guard($request, $response, 'เข้าสู่ระบบด้วย PassKey ไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions, $lockout) {
                return self::passkeyLogin($request, $response, $config, self::db($pdo), $sessions, $lockout);
            });
        });
        $app->map(['GET', 'POST', 'PUT', 'DELETE'], '/auth/passkey/register', static function ($request, $response) use ($config, $pdo) {
            return self::guard($request, $response, 'ลงทะเบียน PassKey ไม่สำเร็จ', static function () use ($request, $response, $config, $pdo) {
                return self::passkeyRegister($request, $response, $config, self::db($pdo));
            });
        });
        $app->map(['POST', 'DELETE'], '/auth/passkey/sync-profile', static function ($request, $response) use ($pdo) {
            return self::guard($request, $response, 'อัปเดต PassKey ไม่สำเร็จ', static function () use ($request, $response, $pdo) {
                return self::passkeySync($request, $response, self::db($pdo));
            });
        });

        $app->map(['GET', 'POST', 'DELETE'], '/admin/whitelist', static function ($request, $response) use ($pdo) {
            return self::guard($request, $response, 'จัดการรายชื่อไม่สำเร็จ', static function () use ($request, $response, $pdo) {
                return self::whitelist($request, $response, self::db($pdo));
            });
        });
        $app->post('/admin/students/create', static function ($request, $response) use ($config, $pdo) {
            return self::guard($request, $response, 'สร้างผู้ใช้ไม่สำเร็จ', static function () use ($request, $response, $config, $pdo) {
                return self::createStudent($request, $response, $config, self::db($pdo));
            });
        });
        $app->post('/admin/students/import', static function ($request, $response) use ($config, $pdo) {
            return self::guard($request, $response, 'Import failed', static function () use ($request, $response, $config, $pdo) {
                return self::importStudents($request, $response, $config, self::db($pdo));
            });
        });
        $app->post('/admin/students/reset-account', static function ($request, $response) use ($config, $pdo, $sessions) {
            return self::guard($request, $response, 'รีเซ็ตบัญชีไม่สำเร็จ', static function () use ($request, $response, $config, $pdo, $sessions) {
                return self::resetStudent($request, $response, $config, self::db($pdo), $sessions);
            });
        });
    }

    private static function passwordLogin(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, Turnstile $turnstile, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $studentId = self::studentId($body);
        $password = self::text($body, 'password', 128);
        if ($password === '') {
            throw new HttpError(400, 'รหัสผ่านสั้นเกินไป');
        }
        self::captcha($turnstile, $request, $body);
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        $account = Accounts::byStudentId($pdo, $studentId);
        $hash = is_array($account) ? self::nullableString($account['current_password_hash'] ?? null) : null;
        $ok = PasswordHash::verify($password, $hash);
        if (!is_array($account) || !$ok || Accounts::blocked($account, time())) {
            if (is_array($account) && !$ok) {
                $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'password', false, time());
            } elseif (!is_array($account)) {
                $lockout->record($pdo, $studentId, null, $ip, 'password', false, time());
            } else {
                $sessions->revokeAccount($pdo, (string) $account['id'], self::https($config, $request), time());
            }
            $extra = [];
            if (is_array($account) && !Accounts::blocked($account, time()) && $hash === null && !Accounts::flag($account['is_registered'] ?? 0)) {
                $extra['needsRegistration'] = true;
                return Json::write($response, 401, [
                    'error' => 'ยังไม่ได้สมัครสมาชิก กรุณากดเริ่มใช้งานเพื่อสมัคร',
                    'needsRegistration' => true,
                ]);
            }
            return Json::write($response, 401, ['error' => self::LOGIN_ERROR] + $extra);
        }
        $replacement = PasswordHash::needsRehash((string) $hash) ? PasswordHash::hash($password) : null;
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'password', true, time());
        AccountWriter::markLoggedIn($pdo, (string) $account['id'], $replacement);
        $fresh = Accounts::byId($pdo, (string) $account['id']) ?? $account;
        return self::sessionJson($request, $response, $config, $pdo, $sessions, $fresh, false);
    }

    private static function pinLogin(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, Turnstile $turnstile, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $studentId = self::studentId($body);
        $pin = self::pin($body, 'pin');
        self::captcha($turnstile, $request, $body);
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        $account = Accounts::byStudentId($pdo, $studentId);
        $hash = is_array($account) ? self::nullableString($account['pin_hash'] ?? null) : null;
        $ok = PasswordHash::verify($pin, $hash);
        $ready = is_array($account)
            && $ok
            && !Accounts::blocked($account, time())
            && Accounts::flag($account['has_logged_in_once'] ?? 0);
        if (!$ready) {
            if (is_array($account) && !$ok) {
                $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'pin', false, time());
            } elseif (!is_array($account)) {
                $lockout->record($pdo, $studentId, null, $ip, 'pin', false, time());
            } elseif (Accounts::blocked($account, time())) {
                $sessions->revokeAccount($pdo, (string) $account['id'], self::https($config, $request), time());
            }
            return Json::write($response, 401, ['error' => self::PIN_ERROR]);
        }
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'pin', true, time());
        $methods = self::withMethod($account['auth_methods'] ?? [], 'pin');
        if (!in_array('pin', $account['auth_methods'] ?? [], true)) {
            AccountWriter::setAuthMethods($pdo, (string) $account['id'], $methods);
        }
        return self::sessionJson($request, $response, $config, $pdo, $sessions, $account, false);
    }

    private static function pinSetup(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, LoginLockout $lockout): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $pin = self::pin(self::body($request), 'pin');
        $studentId = (string) ($account['student_id'] ?? '');
        if ($studentId === '') {
            throw new HttpError(400, 'ไม่พบข้อมูลนักเรียน');
        }
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        AccountWriter::setPin($pdo, (string) $account['id'], PasswordHash::hash($pin), self::withMethod($account['auth_methods'] ?? [], 'pin'));
        self::rotateCurrent($request, $config, $pdo, $sessions, (string) $account['id']);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function lookup(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, Turnstile $turnstile, Limiter $limiter): ResponseInterface
    {
        $studentId = self::queryStudent($request);
        self::captcha($turnstile, $request, null);
        self::window($limiter, $pdo, 'register_lookup', $studentId, self::SLOW_ERROR);
        $account = Accounts::byStudentId($pdo, $studentId);
        $hidden = !is_array($account) || ($account['status'] ?? '') === 'disabled' || Actor::blocked($account, time());
        if ($hidden) {
            return Json::write($response, 200, [
                'found' => false,
                'message' => 'ไม่พบข้อมูล กรุณาตรวจสอบเลขประจำตัวหรือติดต่อผู้ดูแลระบบ',
            ]);
        }
        if (Accounts::flag($account['is_registered'] ?? 0) || self::nullableString($account['current_password_hash'] ?? null) !== null) {
            return Json::write($response, 200, [
                'found' => true,
                'alreadyRegistered' => true,
                'message' => 'คุณเคยสมัครสมาชิกไปแล้ว กรุณาเข้าสู่ระบบ',
            ]);
        }
        $token = RegistrationToken::mint((string) ($config['APP_KEY'] ?? ''), $studentId, time());
        if ($token === null) {
            throw new HttpError(500, 'ค้นหาข้อมูลไม่สำเร็จ');
        }
        return Json::write($response, 200, [
            'found' => true,
            'canRegister' => true,
            'studentId' => $studentId,
            'firstName' => (string) ($account['first_name'] ?? ''),
            'lastName' => (string) ($account['last_name'] ?? ''),
            'gradeLevel' => $account['grade_level'],
            'roomNumber' => $account['room_number'],
            'registrationToken' => $token,
        ]);
    }

    private static function complete(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, Turnstile $turnstile, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $studentId = self::studentId($body);
        $token = self::text($body, 'registrationToken', 512);
        $password = self::text($body, 'password', 128);
        $pin = self::pin($body, 'pin');
        self::newPassword($password);
        self::captcha($turnstile, $request, $body);
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        if (!RegistrationToken::check((string) ($config['APP_KEY'] ?? ''), $token, $studentId, time())) {
            throw new HttpError(400, 'การยืนยันตัวตนหมดอายุ กรุณาเริ่มใหม่');
        }
        $account = Accounts::byStudentId($pdo, $studentId);
        if (!is_array($account) || Accounts::blocked($account, time()) || Accounts::flag($account['is_registered'] ?? 0)) {
            $lockout->record($pdo, $studentId, is_array($account) ? (string) $account['id'] : null, $ip, 'password', false, time());
            throw new HttpError(400, 'สมัครสมาชิกไม่สำเร็จ');
        }
        $display = trim(((string) ($account['first_name'] ?? '')) . ' ' . ((string) ($account['last_name'] ?? '')));
        AccountWriter::register(
            $pdo,
            (string) $account['id'],
            Accounts::emailFor($config, $studentId),
            $display !== '' ? $display : $studentId,
            PasswordHash::hash($password),
            PasswordHash::hash($pin)
        );
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'password', true, time());
        $fresh = Accounts::byId($pdo, (string) $account['id']) ?? $account;
        $payload = self::sessionPayload($request, $config, $pdo, $sessions, $fresh, false);
        $payload = ['success' => true] + $payload;
        $payload['mustChangePassword'] = false;
        $payload['mustSetupPin'] = false;
        return Json::write($response, 200, $payload);
    }

    private static function resetWithSchool(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, Turnstile $turnstile, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $studentId = self::studentId($body);
        $school = self::text($body, 'schoolPassword', 32);
        $password = self::text($body, 'newPassword', 128);
        if (preg_match('/^[A-Za-z0-9]{7,8}$/', $school) !== 1) {
            throw new HttpError(400, 'รหัสผ่านโรงเรียนต้องเป็น a-z, A-Z, 0-9 และยาว 7-8 ตัว');
        }
        self::newPassword($password);
        self::captcha($turnstile, $request, $body);
        return self::finishReset($request, $response, $config, $pdo, $sessions, $lockout, $studentId, $password, 'school_password_hash', $school, 'password');
    }

    private static function resetWithPin(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, Turnstile $turnstile, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $studentId = self::studentId($body);
        $pin = self::pin($body, 'pin');
        $password = self::text($body, 'newPassword', 128);
        self::newPassword($password);
        self::captcha($turnstile, $request, $body);
        return self::finishReset($request, $response, $config, $pdo, $sessions, $lockout, $studentId, $password, 'pin_hash', $pin, 'pin');
    }

    private static function finishReset(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, LoginLockout $lockout, string $studentId, string $password, string $column, string $secret, string $kind): ResponseInterface
    {
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        $account = Accounts::byStudentId($pdo, $studentId);
        $hash = is_array($account) ? self::nullableString($account[$column] ?? null) : null;
        $ok = PasswordHash::verify($secret, $hash);
        if (!is_array($account) || !$ok || Accounts::blocked($account, time())) {
            if (is_array($account) && Accounts::blocked($account, time()) && $ok) {
                $sessions->revokeAccount($pdo, (string) $account['id'], self::https($config, $request), time());
            } else {
                $lockout->record($pdo, $studentId, is_array($account) ? (string) $account['id'] : null, $ip, $kind, false, time());
            }
            return Json::write($response, 401, ['error' => $kind === 'pin' ? self::PIN_ERROR : self::LOGIN_ERROR]);
        }
        $newHash = PasswordHash::hash($password);
        AccountWriter::changePassword($pdo, (string) $account['id'], $newHash);
        $sessions->revokeAccount($pdo, (string) $account['id'], self::https($config, $request), time());
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, $kind, true, time());
        $fresh = Accounts::byId($pdo, (string) $account['id']) ?? $account;
        $payload = self::sessionPayload($request, $config, $pdo, $sessions, $fresh, false);
        return Json::write($response, 200, [
            'success' => true,
            'mustChangePassword' => false,
        ]);
    }

    private static function changePassword(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, LoginLockout $lockout): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $body = self::body($request);
        $current = self::text($body, 'currentPassword', 128);
        $next = self::text($body, 'newPassword', 128);
        self::newPassword($next);
        $studentId = (string) ($account['student_id'] ?? '');
        if ($studentId === '') {
            throw new HttpError(400, 'ไม่พบข้อมูลนักเรียน');
        }
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        $hash = self::nullableString($account['current_password_hash'] ?? null);
        if ($hash === null) {
            throw new HttpError(400, 'บัญชียังไม่ได้ตั้งรหัสผ่าน');
        }
        if (!PasswordHash::verify($current, $hash)) {
            $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'password', false, time());
            throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        AccountWriter::changePassword($pdo, (string) $account['id'], PasswordHash::hash($next));
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'password', true, time());
        self::rotateCurrent($request, $config, $pdo, $sessions, (string) $account['id']);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function verifyPassword(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, LoginLockout $lockout): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $password = self::text(self::body($request), 'password', 128);
        return self::verifySecret($request, $response, $pdo, $lockout, $account, $password, 'current_password_hash', 'password', 'รหัสผ่านไม่ถูกต้อง', 'บัญชียังไม่ได้ตั้งรหัสผ่าน');
    }

    private static function verifyPin(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, LoginLockout $lockout): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $pin = self::pin(self::body($request), 'pin');
        return self::verifySecret($request, $response, $pdo, $lockout, $account, $pin, 'pin_hash', 'pin', 'PIN ไม่ถูกต้อง', 'ยังไม่ได้ตั้ง PIN — ใช้รหัสผ่านแทน');
    }

    private static function verifySecret(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, LoginLockout $lockout, array $account, string $secret, string $column, string $kind, string $wrong, string $missing): ResponseInterface
    {
        $studentId = (string) ($account['student_id'] ?? '');
        if ($studentId === '') {
            throw new HttpError(400, 'ไม่พบข้อมูลนักเรียน');
        }
        $ip = self::ip($request);
        self::assertOpen($lockout, $pdo, $studentId, $ip);
        $hash = self::nullableString($account[$column] ?? null);
        if ($hash === null) {
            throw new HttpError(400, $missing);
        }
        if (!PasswordHash::verify($secret, $hash)) {
            $lockout->record($pdo, $studentId, (string) $account['id'], $ip, $kind, false, time());
            throw new HttpError(401, $wrong);
        }
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, $kind, true, time());
        return Json::write($response, 200, ['success' => true]);
    }

    private static function sessionStatus(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $email = strtolower(trim((string) ($account['email'] ?? '')));
        $listed = false;
        if ($email !== '') {
            $hit = Database::run($pdo, 'SELECT email FROM admin_whitelist WHERE email = ? LIMIT 1', [$email])->fetch();
            $listed = is_array($hit);
        }
        if ($listed) {
            if (AccountWriter::promoteAdmin($pdo, (string) $account['id'])) {
                self::rotateCurrent($request, $config, $pdo, $sessions, (string) $account['id']);
            }
            return Json::write($response, 200, [
                'isAdmin' => true,
                'isStudentVerified' => true,
                'whitelisted' => true,
            ]);
        }
        $pin = self::nullableString($account['pin_hash'] ?? null);
        $loggedIn = Accounts::flag($account['has_logged_in_once'] ?? 0);
        return Json::write($response, 200, [
            'isAdmin' => ($account['role'] ?? '') === 'admin',
            'isStudentVerified' => Accounts::flag($account['is_student_verified'] ?? 0) || ($account['role'] ?? '') === 'admin',
            'whitelisted' => false,
            'mustChangePassword' => Accounts::flag($account['must_change_password'] ?? 0),
            'mustSetupPin' => $loggedIn && $pin === null,
            'hasPin' => $pin !== null,
            'studentId' => $account['student_id'],
            'role' => $account['role'],
            'profile' => Accounts::profile($account),
        ]);
    }

    private static function eligibility(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $account = self::present($request, $pdo);
        if (($account['status'] ?? '') === 'disabled') {
            throw new HttpError(403, 'บัญชีนี้ถูกปิดใช้งาน');
        }
        if (Actor::blocked($account, time())) {
            throw new HttpError(403, 'บัญชีนี้ถูกระงับ');
        }
        if (!Accounts::flag($account['has_logged_in_once'] ?? 0)) {
            throw new HttpError(403, 'กรุณาเข้าสู่ระบบด้วยรหัสผ่านอย่างน้อยหนึ่งครั้งก่อนใช้วิธีอื่น');
        }
        $studentId = self::nullableString($account['student_id'] ?? null);
        if ($studentId === null) {
            throw new HttpError(403, 'ไม่พบเลขประจำตัวในระบบ');
        }
        return Json::write($response, 200, ['eligible' => true, 'studentId' => $studentId]);
    }

    private static function deviceProfile(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, Limiter $limiter): ResponseInterface
    {
        $studentId = self::queryStudent($request);
        self::window($limiter, $pdo, 'device_profile', $studentId, self::SLOW_ERROR);
        $account = Accounts::byStudentId($pdo, $studentId);
        if (!is_array($account) || ($account['status'] ?? '') === 'disabled' || Actor::blocked($account, time())) {
            return Json::write($response, 200, ['exists' => false]);
        }
        $pin = self::nullableString($account['pin_hash'] ?? null) !== null;
        $once = Accounts::flag($account['has_logged_in_once'] ?? 0);
        return Json::write($response, 200, [
            'exists' => true,
            'studentId' => $studentId,
            'nickname' => (string) ($account['nickname'] ?? ''),
            'firstName' => (string) ($account['first_name'] ?? ''),
            'hasLoggedInOnce' => $once,
            'hasPin' => $pin,
            'quickUnlockAvailable' => $once && $pin,
        ]);
    }

    private static function banned(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $account = self::present($request, $pdo);
        return Json::write($response, 200, Accounts::banView($account, time()));
    }

    private static function logout(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions): ResponseInterface
    {
        $session = $request->getAttribute(Attrs::SESSION);
        if (!$session instanceof SessionRecord || $session->accountId === null) {
            throw new HttpError(401, 'Unauthorized');
        }
        $sessions->revoke($pdo, $session->id, self::https($config, $request), time());
        return Json::write($response, 200, ['success' => true]);
    }

    private static function passkeyOptions(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, Turnstile $turnstile): ResponseInterface
    {
        $body = self::body($request);
        self::captcha($turnstile, $request, $body);
        $place = Passkeys::origin($config);
        if ($place === null) {
            throw new HttpError(500, 'ไม่สามารถเริ่ม PassKey login');
        }
        $raw = $body['studentId'] ?? null;
        $account = null;
        if ($raw !== null && $raw !== '') {
            $studentId = self::studentId($body);
            $account = Accounts::byStudentId($pdo, $studentId);
            if (!is_array($account) || Passkeys::credentials($account) === [] || Accounts::blocked($account, time())) {
                throw new HttpError(400, 'ยังไม่ได้ลงทะเบียน PassKey');
            }
        }
        $built = Passkeys::loginOptions($account, $place['rpId']);
        $key = Passkeys::store($pdo, 'passkey_login', is_array($account) ? (string) $account['id'] : null, [
            'challenge' => $built['challenge'],
            'studentId' => $built['studentId'],
            'rpId' => $place['rpId'],
            'origin' => $place['origin'],
        ], time(), self::ip($request), $request->getHeaderLine('User-Agent'));
        return Json::write($response, 200, ['options' => $built['options'], 'challengeKey' => $key]);
    }

    private static function passkeyLogin(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, LoginLockout $lockout): ResponseInterface
    {
        $body = self::body($request);
        $key = self::text($body, 'challengeKey', 128);
        $payload = $body['response'] ?? null;
        if (!is_array($payload)) {
            throw new HttpError(400, 'Passkey response ไม่ถูกต้อง');
        }
        self::fillRawId($payload);
        $place = Passkeys::origin($config);
        if ($place === null) {
            throw new HttpError(500, 'เข้าสู่ระบบด้วย PassKey ไม่สำเร็จ');
        }
        $stored = Passkeys::take($pdo, 'passkey_login', $key, time());
        if ($stored === null || ($stored['rpId'] ?? '') !== $place['rpId'] || ($stored['origin'] ?? '') !== $place['origin']) {
            throw new HttpError(400, 'Challenge หมดอายุ');
        }
        $studentId = '';
        if (isset($body['studentId']) && $body['studentId'] !== null && $body['studentId'] !== '') {
            $studentId = self::studentId($body);
        }
        if ($studentId === '') {
            $studentId = (string) ($stored['studentId'] ?? '');
        }
        $responseBody = is_array($payload['response'] ?? null) ? $payload['response'] : [];
        if ($studentId === '') {
            $studentId = (string) (Passkeys::studentFromHandle(is_string($responseBody['userHandle'] ?? null) ? $responseBody['userHandle'] : null) ?? '');
        }
        $credentialId = is_string($payload['id'] ?? null) ? $payload['id'] : '';
        if ($studentId === '' && $credentialId !== '') {
            $found = Database::run($pdo, 'SELECT student_id FROM passkey_lookup WHERE credential_id = ? LIMIT 1', [$credentialId])->fetch();
            if (is_array($found) && is_string($found['student_id'])) {
                $studentId = $found['student_id'];
            }
        }
        $pinned = is_string($stored['studentId'] ?? null) ? $stored['studentId'] : '';
        if ($pinned !== '' && ($studentId === '' || !hash_equals($pinned, $studentId))) {
            throw new HttpError(400, 'Challenge หมดอายุ');
        }
        $ip = self::ip($request);
        if ($studentId !== '') {
            self::assertOpen($lockout, $pdo, $studentId, $ip);
        } else {
            self::assertOpen($lockout, $pdo, null, $ip);
        }
        $account = $studentId !== '' ? Accounts::byStudentId($pdo, $studentId) : null;
        $credential = is_array($account) ? Passkeys::findCredential($account, $credentialId) : null;
        if (!is_array($account) || $credential === null || Accounts::blocked($account, time()) || !Accounts::flag($account['has_logged_in_once'] ?? 0)) {
            $lockout->record($pdo, $studentId !== '' ? $studentId : null, is_array($account) ? (string) $account['id'] : null, $ip, 'passkey', false, time());
            throw new HttpError(401, 'ยืนยัน PassKey ไม่สำเร็จ');
        }
        try {
            $checked = Passkeys::verifyLogin($stored, $credential, $payload, $place['rpId'], $place['origin'], $studentId);
        } catch (Throwable $e) {
            Log::get()->info('passkey login rejected', ['class' => $e::class]);
            $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'passkey', false, time());
            throw new HttpError(401, 'ยืนยัน PassKey ไม่สำเร็จ');
        }
        $transports = [];
        foreach ($responseBody['transports'] ?? [] as $transport) {
            if (is_string($transport)) {
                $transports[] = $transport;
            }
        }
        $next = [];
        foreach (Passkeys::credentials($account) as $item) {
            if (hash_equals($item['credentialId'], $credential['credentialId'])) {
                $next[] = Passkeys::storedFromRecord($checked, $item, $transports);
            } else {
                $next[] = $item;
            }
        }
        AccountWriter::setPasskeys($pdo, (string) $account['id'], $next, self::withMethod($account['auth_methods'] ?? [], 'passkey'));
        AccountWriter::savePasskeyLookup($pdo, $credential['credentialId'], $studentId);
        $lockout->record($pdo, $studentId, (string) $account['id'], $ip, 'passkey', true, time());
        $fresh = Accounts::byId($pdo, (string) $account['id']) ?? $account;
        return self::sessionJson($request, $response, $config, $pdo, $sessions, $fresh, false);
    }

    private static function passkeyRegister(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $method = strtoupper($request->getMethod());
        $studentId = (string) ($account['student_id'] ?? '');
        if ($method === 'GET') {
            if ($studentId === '') {
                return Json::write($response, 200, ['hasPasskey' => false, 'count' => 0]);
            }
            $count = count(Passkeys::credentials($account));
            return Json::write($response, 200, ['hasPasskey' => $count > 0, 'count' => $count]);
        }
        if ($studentId === '') {
            throw new HttpError(400, 'ไม่พบข้อมูลนักเรียน');
        }
        if ($method === 'DELETE') {
            $ids = array_map(static fn (array $item): string => $item['credentialId'], Passkeys::credentials($account));
            AccountWriter::setPasskeys($pdo, (string) $account['id'], [], self::withoutMethod($account['auth_methods'] ?? [], 'passkey'));
            AccountWriter::deletePasskeyLookup($pdo, $ids);
            return Json::write($response, 200, ['success' => true]);
        }
        $place = Passkeys::origin($config);
        if ($place === null) {
            throw new HttpError(500, 'ลงทะเบียน PassKey ไม่สำเร็จ');
        }
        if ($method === 'POST') {
            $built = Passkeys::registrationOptions($account, $place['rpId']);
            $key = Passkeys::store($pdo, 'passkey_register', (string) $account['id'], [
                'challenge' => $built['challenge'],
                'studentId' => $studentId,
                'accountId' => (string) $account['id'],
                'rpId' => $place['rpId'],
                'origin' => $place['origin'],
            ], time(), self::ip($request), $request->getHeaderLine('User-Agent'));
            return Json::write($response, 200, ['options' => $built['options'], 'challengeKey' => $key]);
        }
        $body = self::body($request);
        $key = self::text($body, 'challengeKey', 128);
        $payload = $body['response'] ?? null;
        if (!is_array($payload)) {
            throw new HttpError(400, 'Passkey response ไม่ถูกต้อง');
        }
        self::fillRawId($payload);
        $stored = Passkeys::take($pdo, 'passkey_register', $key, time());
        $owner = (string) ($stored['accountId'] ?? '');
        if ($stored === null || !hash_equals((string) $account['id'], $owner) || ($stored['origin'] ?? '') !== $place['origin']) {
            throw new HttpError(400, 'Challenge หมดอายุ');
        }
        try {
            $checked = Passkeys::verifyRegistration($stored, $payload, $place['rpId'], $place['origin']);
        } catch (Throwable $e) {
            Log::get()->info('passkey register rejected', ['class' => $e::class]);
            throw new HttpError(400, 'ยืนยัน PassKey ไม่สำเร็จ');
        }
        $credentialId = Passkeys::b64($checked->publicKeyCredentialId);
        $existing = Database::run($pdo, 'SELECT student_id FROM passkey_lookup WHERE credential_id = ? LIMIT 1', [$credentialId])->fetch();
        if (is_array($existing) && is_string($existing['student_id']) && !hash_equals($studentId, $existing['student_id'])) {
            throw new HttpError(400, 'ยืนยัน PassKey ไม่สำเร็จ');
        }
        $responseBody = is_array($payload['response'] ?? null) ? $payload['response'] : [];
        $transports = [];
        foreach ($responseBody['transports'] ?? [] as $transport) {
            if (is_string($transport)) {
                $transports[] = $transport;
            }
        }
        $next = [];
        foreach (Passkeys::credentials($account) as $item) {
            if (!hash_equals($item['credentialId'], $credentialId)) {
                $next[] = $item;
            }
        }
        $next[] = Passkeys::storedFromRecord($checked, [], $transports);
        AccountWriter::setPasskeys($pdo, (string) $account['id'], $next, self::withMethod($account['auth_methods'] ?? [], 'passkey'));
        AccountWriter::savePasskeyLookup($pdo, $credentialId, $studentId);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function passkeySync(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $account = self::userAccount($request, $pdo);
        $remove = strtoupper($request->getMethod()) === 'DELETE';
        $methods = $remove
            ? self::withoutMethod($account['auth_methods'] ?? [], 'passkey')
            : self::withMethod($account['auth_methods'] ?? [], 'passkey');
        AccountWriter::setAuthMethods($pdo, (string) $account['id'], $methods);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function whitelist(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        self::admin($request);
        $method = strtoupper($request->getMethod());
        if ($method === 'GET') {
            if (!Authz::permits('admin_whitelist', 'select', self::actor($request))) {
                throw new HttpError(403, 'Forbidden');
            }
            $counts = [];
            foreach ([
                'totalStudents' => 'SELECT COUNT(*) FROM accounts',
                'loggedInCount' => 'SELECT COUNT(*) FROM accounts WHERE has_logged_in_once = 1',
                'registeredCount' => 'SELECT COUNT(*) FROM accounts WHERE is_registered = 1',
                'disabledCount' => 'SELECT COUNT(*) FROM accounts WHERE status = \'disabled\'',
            ] as $key => $sql) {
                $counts[$key] = (int) Database::run($pdo, $sql)->fetchColumn();
            }
            $rows = Database::run(
                $pdo,
                'SELECT email, added_by, added_at, note, updated_at FROM admin_whitelist ORDER BY email'
            )->fetchAll();
            $whitelist = [];
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $whitelist[] = [
                    'email' => $row['email'],
                    'added_by' => $row['added_by'],
                    'added_at' => Accounts::iso($row['added_at']),
                    'note' => $row['note'],
                    'updated_at' => Accounts::iso($row['updated_at']),
                ];
            }
            return Json::write($response, 200, [
                'totalStudents' => $counts['totalStudents'],
                'loggedInCount' => $counts['loggedInCount'],
                'registeredCount' => $counts['registeredCount'],
                'pendingRegistrationCount' => max(0, $counts['totalStudents'] - $counts['registeredCount']),
                'disabledCount' => $counts['disabledCount'],
                'whitelist' => $whitelist,
            ]);
        }
        if ($method === 'POST') {
            $body = self::body($request);
            $email = strtolower(trim(self::text($body, 'email', 255)));
            if ($email === '' || !str_contains($email, '@') || preg_match('/\s/', $email) === 1) {
                throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
            }
            $note = self::optional($body, 'note', 500);
            $actor = self::actor($request);
            Database::run(
                $pdo,
                'INSERT INTO admin_whitelist (email, added_by, note) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE note = VALUES(note), added_by = VALUES(added_by)',
                [$email, $actor->accountId, $note]
            );
            return Json::write($response, 200, ['success' => true, 'email' => $email]);
        }
        $email = strtolower(trim((string) ($request->getQueryParams()['email'] ?? '')));
        if ($email === '' || strlen($email) > 255) {
            throw new HttpError(400, 'ต้องระบุ email');
        }
        Database::run($pdo, 'DELETE FROM admin_whitelist WHERE email = ?', [$email]);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function createStudent(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo): ResponseInterface
    {
        self::admin($request);
        $body = self::body($request);
        $studentId = self::studentId($body);
        $first = self::text($body, 'firstName', 100);
        $last = self::text($body, 'lastName', 100);
        if ($first === '' || $last === '') {
            throw new HttpError(400, 'กรุณากรอกชื่อ');
        }
        $password = self::optional($body, 'password', 32);
        if ($password !== null && preg_match('/^[A-Za-z0-9]{7,8}$/', $password) !== 1) {
            throw new HttpError(400, 'รหัสผ่านต้องเป็น a-z A-Z 0-9 ความยาว 7-8 ตัว');
        }
        $grade = self::optional($body, 'gradeLevel', 16);
        if ($grade !== null && !in_array($grade, ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'], true)) {
            throw new HttpError(400, 'ระดับชั้นไม่ถูกต้อง');
        }
        $room = self::optional($body, 'roomNumber', 16);
        if ($room !== null && preg_match('/^\d{1,2}$/', $room) !== 1) {
            throw new HttpError(400, 'ห้องต้องเป็นตัวเลข 1-2 หลัก');
        }
        $role = self::optional($body, 'role', 16) ?? 'user';
        if (!in_array($role, ['user', 'admin'], true)) {
            throw new HttpError(400, 'บทบาทไม่ถูกต้อง');
        }
        if (Accounts::byStudentId($pdo, $studentId) !== null) {
            throw new HttpError(400, 'เลขประจำตัว ' . $studentId . ' มีในระบบแล้ว');
        }
        $hash = $password !== null ? PasswordHash::hash($password) : null;
        $id = Ids::uuid();
        AccountWriter::insertRoster($pdo, [
            'id' => $id,
            'student_id' => $studentId,
            'email' => Accounts::emailFor($config, $studentId),
            'display_name' => trim($first . ' ' . $last),
            'first_name' => $first,
            'last_name' => $last,
            'nickname' => $first,
            'role' => $role,
            'grade_level' => $grade,
            'room_number' => $room,
            'school_password_hash' => $hash,
            'current_password_hash' => $hash,
            'import_batch_id' => 'manual_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(3)),
        ]);
        return Json::write($response, 200, [
            'success' => true,
            'studentId' => $studentId,
            'uid' => $id,
            'role' => $role,
        ]);
    }

    private static function importStudents(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo): ResponseInterface
    {
        self::admin($request);
        $body = self::body($request);
        if (!array_key_exists('csvContent', $body)) {
            throw new HttpError(400, 'ต้องส่ง csvContent');
        }
        $csv = self::text($body, 'csvContent', 200000);
        if ($csv === '') {
            throw new HttpError(400, 'ต้องส่ง csvContent');
        }
        $dry = ($body['dryRun'] ?? false) === true;
        $parsed = Roster::parse($csv);
        if ($parsed['rows'] === [] && $parsed['errors'] !== []) {
            throw new HttpError(400, 'ไม่พบข้อมูลที่นำเข้าได้', ['parseErrors' => $parsed['errors']]);
        }
        if (count($parsed['rows']) > 1000) {
            throw new HttpError(400, 'นำเข้าได้ไม่เกิน 1000 แถวต่อครั้ง');
        }
        if ($dry) {
            $preview = [];
            foreach ($parsed['rows'] as $row) {
                $preview[] = [
                    'studentId' => $row['studentId'],
                    'firstName' => $row['firstName'],
                    'lastName' => $row['lastName'],
                    'nickname' => $row['nickname'],
                    'gradeLevel' => $row['gradeLevel'],
                    'roomNumber' => $row['roomNumber'],
                    'format' => $row['format'],
                    'lineNumber' => $row['lineNumber'],
                ];
            }
            return Json::write($response, 200, [
                'dryRun' => true,
                'previewCount' => count($preview),
                'rows' => $preview,
                'parseErrors' => $parsed['errors'],
            ]);
        }
        $batch = 'batch_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(3));
        $summary = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => $parsed['errors']];
        foreach ($parsed['rows'] as $row) {
            try {
                self::importRow($pdo, $config, $row, $batch, $summary);
            } catch (Throwable $e) {
                Log::get()->info('roster row skipped', ['class' => $e::class]);
                $summary['errors'][] = ['line' => $row['lineNumber'], 'message' => 'นำเข้าแถวนี้ไม่สำเร็จ'];
            }
        }
        return Json::write($response, 200, [
            'importBatchId' => $batch,
            'summary' => $summary,
            'previewCount' => count($parsed['rows']),
        ]);
    }

    private static function importRow(PDO $pdo, array $config, array $row, string $batch, array &$summary): void
    {
        $grade = $row['gradeLevel'];
        $room = $row['roomNumber'];
        if (is_string($grade) && strlen($grade) > 16) {
            throw new \RuntimeException('grade');
        }
        if (is_string($room) && strlen($room) > 16) {
            throw new \RuntimeException('room');
        }
        $existing = Accounts::byStudentId($pdo, $row['studentId']);
        $hash = null;
        if (is_string($row['password']) && $row['password'] !== '') {
            $hash = PasswordHash::hash($row['password']);
        }
        $fields = [
            'first_name' => $row['firstName'],
            'last_name' => $row['lastName'],
            'nickname' => $row['nickname'],
            'grade_level' => $grade,
            'room_number' => $room,
            'import_batch_id' => $batch,
            'school_password_hash' => $hash,
            'current_password_hash' => $hash,
        ];
        if (!is_array($existing)) {
            AccountWriter::insertRoster($pdo, [
                'id' => Ids::uuid(),
                'student_id' => $row['studentId'],
                'email' => Accounts::emailFor($config, $row['studentId']),
                'display_name' => trim($row['firstName'] . ' ' . $row['lastName']),
                'first_name' => $row['firstName'],
                'last_name' => $row['lastName'],
                'nickname' => $row['nickname'],
                'role' => 'user',
                'grade_level' => $grade,
                'room_number' => $room,
                'school_password_hash' => $hash,
                'current_password_hash' => $hash,
                'import_batch_id' => $batch,
            ]);
            $summary['created']++;
            return;
        }
        $registered = Accounts::flag($existing['is_registered'] ?? 0) || Accounts::flag($existing['has_logged_in_once'] ?? 0);
        $replace = $hash !== null && !$registered;
        if ($registered && is_string($existing['grade_level']) && $grade === null) {
            $fields['grade_level'] = $existing['grade_level'];
        }
        if ($registered && is_string($existing['room_number']) && $room === null) {
            $fields['room_number'] = $existing['room_number'];
        }
        AccountWriter::updateRoster($pdo, (string) $existing['id'], $fields, $replace);
        $summary['updated']++;
    }

    private static function resetStudent(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions): ResponseInterface
    {
        self::admin($request);
        $studentId = self::studentId(self::body($request));
        $account = Accounts::byStudentId($pdo, $studentId);
        if (!is_array($account)) {
            throw new HttpError(404, 'ไม่พบเลขประจำตัวในระบบ');
        }
        $ids = array_map(static fn (array $item): string => $item['credentialId'], Passkeys::credentials($account));
        AccountWriter::resetLogin($pdo, (string) $account['id']);
        AccountWriter::deletePasskeyLookup($pdo, $ids);
        $session = $request->getAttribute(Attrs::SESSION);
        $target = (string) $account['id'];
        $self = $session instanceof SessionRecord
            && is_string($session->accountId)
            && hash_equals($session->accountId, $target);
        $sessions->revokeAccount($pdo, $target, self::https($config, $request), time(), $self);
        return Json::write($response, 200, ['success' => true]);
    }

    private static function sessionJson(ServerRequestInterface $request, ResponseInterface $response, array $config, PDO $pdo, SessionService $sessions, array $account, bool $mustSetupPin): ResponseInterface
    {
        return Json::write($response, 200, self::sessionPayload($request, $config, $pdo, $sessions, $account, $mustSetupPin));
    }

    private static function sessionPayload(ServerRequestInterface $request, array $config, PDO $pdo, SessionService $sessions, array $account, bool $forcePin): array
    {
        $https = self::https($config, $request);
        $now = time();
        $ip = self::ip($request);
        $agent = $request->getHeaderLine('User-Agent');
        $current = $request->getAttribute(Attrs::SESSION);
        $pdo->beginTransaction();
        try {
            if ($current instanceof SessionRecord && $current->accountId !== null && hash_equals($current->accountId, (string) $account['id'])) {
                $sessions->revokeOthers($pdo, (string) $account['id'], $current->id, $now);
                $issued = $sessions->rotate($pdo, $current->id, $https, $now);
            } else {
                if ($current instanceof SessionRecord) {
                    $sessions->revoke($pdo, $current->id, $https, $now);
                }
                $issued = $sessions->issue($pdo, (string) $account['id'], $https, $now, $ip, $agent !== '' ? $agent : null);
                $issued = $sessions->rotate($pdo, $issued->record->id, $https, $now);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $pin = self::nullableString($account['pin_hash'] ?? null);
        return [
            'mustChangePassword' => Accounts::flag($account['must_change_password'] ?? 0),
            'mustSetupPin' => $forcePin || $pin === null,
            'studentId' => $account['student_id'],
            'nickname' => (string) ($account['nickname'] ?? ''),
            'uid' => (string) $account['id'],
        ];
    }

    private static function rotateCurrent(ServerRequestInterface $request, array $config, PDO $pdo, SessionService $sessions, string $accountId): void
    {
        $session = $request->getAttribute(Attrs::SESSION);
        if (!$session instanceof SessionRecord || $session->accountId === null || !hash_equals($session->accountId, $accountId)) {
            $sessions->revokeAccount($pdo, $accountId, self::https($config, $request), time());
            return;
        }
        $sessions->revokeOthers($pdo, $accountId, $session->id, time());
        $sessions->rotate($pdo, $session->id, self::https($config, $request), time());
    }

    private static function userAccount(ServerRequestInterface $request, PDO $pdo): array
    {
        $account = self::present($request, $pdo);
        if (($account['status'] ?? '') !== 'active' || Actor::blocked($account, time())) {
            throw new HttpError(403, 'Forbidden');
        }
        return $account;
    }

    private static function present(ServerRequestInterface $request, PDO $pdo): array
    {
        $actor = self::actor($request);
        if ($actor->isGuest() || $actor->accountId === null) {
            throw new HttpError(401, 'Unauthorized');
        }
        $account = Accounts::byId($pdo, $actor->accountId);
        if (!is_array($account)) {
            throw new HttpError(401, 'Unauthorized');
        }
        return $account;
    }

    private static function admin(ServerRequestInterface $request): void
    {
        $actor = self::actor($request);
        if ($actor->isGuest()) {
            throw new HttpError(401, 'Unauthorized');
        }
        if (!$actor->isAdmin() || !$actor->active) {
            throw new HttpError(403, 'Forbidden');
        }
    }

    private static function actor(ServerRequestInterface $request): Actor
    {
        $actor = $request->getAttribute(Attrs::ACTOR);
        return $actor instanceof Actor ? $actor : Actor::guest();
    }

    private static function assertOpen(LoginLockout $lockout, PDO $pdo, ?string $studentId, string $ip): void
    {
        $wait = $lockout->blocked($pdo, $studentId, $ip, time());
        if ($wait > 0) {
            throw new HttpError(429, self::LOCK_ERROR, ['retryAfterMs' => $wait * 1000], ['Retry-After' => (string) $wait]);
        }
    }

    private static function window(Limiter $limiter, PDO $pdo, string $scope, string $studentId, string $message): void
    {
        $decision = $limiter->hit($pdo, $scope, $studentId, 5, 60, time());
        if (!$decision->allowed) {
            throw new HttpError(429, $message, ['retryAfterMs' => $decision->retryAfter * 1000], ['Retry-After' => (string) max(1, $decision->retryAfter)]);
        }
    }

    private static function captcha(Turnstile $turnstile, ServerRequestInterface $request, ?array $body): void
    {
        if (!$turnstile->enabled()) {
            return;
        }
        $token = $request->getHeaderLine('X-Turnstile-Token');
        if ($token === '' && is_array($body) && is_string($body['turnstileToken'] ?? null)) {
            $token = $body['turnstileToken'];
        }
        $result = $turnstile->verify($token, self::ip($request));
        if (!$result->ok) {
            throw new HttpError(400, 'ยืนยันว่าไม่ใช่บอทไม่ผ่าน');
        }
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body)) {
            throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
        }
        return $body;
    }

    private static function studentId(array $body): string
    {
        $value = $body['studentId'] ?? null;
        if (!is_string($value) || preg_match('/^\d{5}$/', trim($value)) !== 1) {
            throw new HttpError(400, 'เลขประจำตัวนักเรียนต้องเป็นตัวเลข 5 หลัก');
        }
        return trim($value);
    }

    private static function queryStudent(ServerRequestInterface $request): string
    {
        $value = $request->getQueryParams()['studentId'] ?? '';
        if (!is_string($value) || preg_match('/^\d{5}$/', trim($value)) !== 1) {
            throw new HttpError(400, 'เลขประจำตัวไม่ถูกต้อง');
        }
        return trim($value);
    }

    private static function pin(array $body, string $key): string
    {
        $value = self::text($body, $key, 6);
        if (preg_match('/^\d{6}$/', $value) !== 1) {
            throw new HttpError(400, 'PIN ต้องเป็นตัวเลข 6 หลัก');
        }
        return $value;
    }

    private static function newPassword(string $password): void
    {
        if (strlen($password) < 8 || preg_match('/[A-Za-z]/', $password) !== 1 || preg_match('/\d/', $password) !== 1) {
            throw new HttpError(400, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว และมีตัวอักษรกับตัวเลข');
        }
        if (!PasswordHash::fits($password)) {
            throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
        }
    }

    private static function text(array $body, string $key, int $max): string
    {
        if (!array_key_exists($key, $body) || !is_string($body[$key])) {
            throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง', ['field' => $key]);
        }
        $value = trim($body[$key]);
        if (str_contains($value, "\0") || strlen($value) > $max) {
            throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง', ['field' => $key]);
        }
        return $value;
    }

    private static function optional(array $body, string $key, int $max): ?string
    {
        if (!array_key_exists($key, $body) || $body[$key] === null || $body[$key] === '') {
            return null;
        }
        return self::text($body, $key, $max);
    }

    private static function nullableString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function withMethod(array $methods, string $method): array
    {
        $next = [];
        foreach ($methods as $item) {
            if (is_string($item) && $item !== '' && !in_array($item, $next, true)) {
                $next[] = $item;
            }
        }
        if (!in_array($method, $next, true)) {
            $next[] = $method;
        }
        return $next;
    }

    private static function withoutMethod(array $methods, string $method): array
    {
        $next = [];
        foreach ($methods as $item) {
            if (is_string($item) && $item !== $method && !in_array($item, $next, true)) {
                $next[] = $item;
            }
        }
        return $next;
    }

    private static function fillRawId(array &$payload): void
    {
        if ((!isset($payload['rawId']) || $payload['rawId'] === '') && is_string($payload['id'] ?? null)) {
            $payload['rawId'] = $payload['id'];
        }
        if (!isset($payload['type'])) {
            $payload['type'] = 'public-key';
        }
    }

    private static function ip(ServerRequestInterface $request): string
    {
        $client = $request->getAttribute(Attrs::CLIENT);
        return $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
    }

    private static function https(array $config, ServerRequestInterface $request): bool
    {
        return Https::requested($config, $request->getServerParams());
    }

    private static function db(\Closure $pdo): PDO
    {
        $connection = $pdo();
        if (!$connection instanceof PDO) {
            throw new HttpError(503, 'server_error');
        }
        return $connection;
    }

    private static function guard(ServerRequestInterface $request, ResponseInterface $response, string $fallback, callable $work): ResponseInterface
    {
        try {
            $result = $work();
            return $result instanceof ResponseInterface ? $result : $response;
        } catch (HttpError $e) {
            throw $e;
        } catch (Throwable $e) {
            Log::get()->error('auth route failed', ['class' => $e::class, 'path' => $request->getUri()->getPath()]);
            throw new HttpError(500, $fallback);
        }
    }
}
