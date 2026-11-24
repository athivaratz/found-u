<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Database;
use Foundu\Ids;
use PDO;
use Throwable;

// The first admin row. create-admin.php and the web installer both call this
// so the password rule and the insert stay in one place.
final class BootstrapAdmin
{
    public static function passwordError(string $password, string $studentId, bool $strict): ?string
    {
        if ($password === '') {
            return 'empty';
        }
        if (strlen($password) > 128) {
            return 'long';
        }
        if (strlen($password) < 8 || preg_match('/[A-Za-z]/', $password) !== 1 || preg_match('/\d/', $password) !== 1) {
            return 'weak';
        }
        if (!defined('PASSWORD_ARGON2ID') && strlen($password) > 72) {
            return 'bcrypt';
        }
        if ($strict && $password === $studentId) {
            return 'same';
        }
        if ($strict) {
            $bad = [
                'password1', 'password123', '12345678', 'qwerty123', 'admin123',
                'letmein1', 'changeme1', 'foundu123', 'abc12345',
            ];
            if (in_array(strtolower($password), $bad, true)) {
                return 'common';
            }
        }
        return null;
    }

    public static function hash(string $password): string
    {
        return PasswordHash::hash($password);
    }

    public static function name(string $value, string $fallback): string
    {
        $value = trim(preg_replace('/[\x00-\x1F\x7F]/', '', $value) ?? '');
        if ($value === '') {
            return $fallback;
        }
        if (strlen($value) > 100) {
            return '';
        }
        return $value;
    }

    /**
     * @param array{id: string, studentId: string, email: string, display: string, first: string, last: string, nickname: string, hash: string} $row
     */
    public static function apply(PDO $pdo, array $row): int
    {
        return (int) Database::privileged($pdo, static function (PDO $pdo) use ($row): int {
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO accounts (
                        id, student_id, linked_uid, email, display_name, first_name, last_name, nickname,
                        role, current_password_hash, school_password_hash, is_student_verified, is_registered,
                        status, auth_methods, passkey_credentials
                     ) SELECT
                        ?, ?, ?, ?, ?, ?, ?, ?,
                        \'admin\', ?, ?, 1, 1,
                        \'active\', JSON_ARRAY(\'password\'), JSON_ARRAY()
                     FROM DUAL
                     WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE student_id = ? OR id = ?)'
                );
                $stmt->execute([
                    $row['id'], $row['studentId'], $row['id'], $row['email'], $row['display'],
                    $row['first'], $row['last'], $row['nickname'], $row['hash'], $row['hash'],
                    $row['studentId'], $row['id'],
                ]);
                $written = $stmt->rowCount();
                $pdo->commit();
                return $written;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        });
    }

    public static function newId(): string
    {
        return Ids::uuid();
    }
}
