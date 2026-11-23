<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Database;
use Foundu\Ids;
use PDO;

// Every write lists its columns. Nothing here copies a request body onto
// the table. The guard trigger is the backstop; this is the path that is
// allowed to set the flag.
final class AccountWriter
{
    public static function insertRoster(PDO $pdo, array $row): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($row): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, first_name, last_name, nickname,
                    role, grade_level, room_number, school_password_hash, current_password_hash,
                    must_change_password, has_logged_in_once, is_registered, status, import_batch_id,
                    ban_status, is_student_verified, has_seen_tutorial, auth_methods, passkey_credentials
                 ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    0, 0, 0, \'active\', ?,
                    \'none\', 0, 0, JSON_ARRAY(), JSON_ARRAY()
                 )',
                [
                    $row['id'],
                    $row['student_id'],
                    $row['id'],
                    $row['email'],
                    $row['display_name'],
                    $row['first_name'],
                    $row['last_name'],
                    $row['nickname'],
                    $row['role'],
                    $row['grade_level'],
                    $row['room_number'],
                    $row['school_password_hash'],
                    $row['current_password_hash'],
                    $row['import_batch_id'],
                ]
            );
        });
    }

    public static function updateRoster(PDO $pdo, string $id, array $fields, bool $replacePassword): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $fields, $replacePassword): void {
            if ($replacePassword) {
                Database::run(
                    $pdo,
                    'UPDATE accounts SET
                        first_name = ?, last_name = ?, nickname = ?, grade_level = ?, room_number = ?,
                        import_batch_id = ?, school_password_hash = ?, current_password_hash = ?,
                        must_change_password = 0
                     WHERE id = ?',
                    [
                        $fields['first_name'],
                        $fields['last_name'],
                        $fields['nickname'],
                        $fields['grade_level'],
                        $fields['room_number'],
                        $fields['import_batch_id'],
                        $fields['school_password_hash'],
                        $fields['current_password_hash'],
                        $id,
                    ]
                );
                return;
            }
            Database::run(
                $pdo,
                'UPDATE accounts SET
                    first_name = ?, last_name = ?, nickname = ?, grade_level = ?, room_number = ?,
                    import_batch_id = ?
                 WHERE id = ?',
                [
                    $fields['first_name'],
                    $fields['last_name'],
                    $fields['nickname'],
                    $fields['grade_level'],
                    $fields['room_number'],
                    $fields['import_batch_id'],
                    $id,
                ]
            );
        });
    }

    public static function markLoggedIn(PDO $pdo, string $id, ?string $passwordHash): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $passwordHash): void {
            if ($passwordHash === null) {
                Database::run(
                    $pdo,
                    'UPDATE accounts SET linked_uid = id, has_logged_in_once = 1, is_registered = 1 WHERE id = ?',
                    [$id]
                );
                return;
            }
            Database::run(
                $pdo,
                'UPDATE accounts SET
                    linked_uid = id, has_logged_in_once = 1, is_registered = 1, current_password_hash = ?
                 WHERE id = ?',
                [$passwordHash, $id]
            );
        });
    }

    public static function register(PDO $pdo, string $id, string $email, string $display, string $passwordHash, string $pinHash): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $email, $display, $passwordHash, $pinHash): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET
                    linked_uid = id, email = ?, display_name = ?,
                    school_password_hash = ?, current_password_hash = ?, pin_hash = ?,
                    must_change_password = 0, has_logged_in_once = 1, is_registered = 1,
                    is_student_verified = 1, auth_methods = ?
                 WHERE id = ?',
                [$email, $display, $passwordHash, $passwordHash, $pinHash, json_encode(['password', 'pin']), $id]
            );
        });
    }

    public static function changePassword(PDO $pdo, string $id, string $passwordHash): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $passwordHash): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET current_password_hash = ?, must_change_password = 0 WHERE id = ?',
                [$passwordHash, $id]
            );
        });
    }

    public static function setPin(PDO $pdo, string $id, string $pinHash, array $methods): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $pinHash, $methods): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET pin_hash = ?, auth_methods = ? WHERE id = ?',
                [$pinHash, json_encode(array_values($methods)), $id]
            );
        });
    }

    public static function setPasskeys(PDO $pdo, string $id, array $credentials, array $methods): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $credentials, $methods): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET passkey_credentials = ?, auth_methods = ? WHERE id = ?',
                [json_encode(array_values($credentials)), json_encode(array_values($methods)), $id]
            );
        });
    }

    public static function setAuthMethods(PDO $pdo, string $id, array $methods): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $methods): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET auth_methods = ? WHERE id = ?',
                [json_encode(array_values($methods)), $id]
            );
        });
    }

    public static function promoteAdmin(PDO $pdo, string $id): bool
    {
        $changed = false;
        Database::privileged($pdo, static function (PDO $pdo) use ($id, &$changed): void {
            $statement = Database::run(
                $pdo,
                'UPDATE accounts SET role = \'admin\', is_student_verified = 1 WHERE id = ? AND role <> \'admin\'',
                [$id]
            );
            $changed = $statement->rowCount() > 0;
        });
        return $changed;
    }

    public static function resetLogin(PDO $pdo, string $id): void
    {
        Database::privileged($pdo, static function (PDO $pdo) use ($id): void {
            Database::run(
                $pdo,
                'UPDATE accounts SET
                    school_password_hash = NULL, current_password_hash = NULL, pin_hash = NULL,
                    passkey_credentials = JSON_ARRAY(), auth_methods = JSON_ARRAY(),
                    has_logged_in_once = 0, is_registered = 0, is_student_verified = 0,
                    must_change_password = 0
                 WHERE id = ?',
                [$id]
            );
        });
    }

    // P5 calls this. A ban or a live timeout revokes every session. Clearing
    // the ban does not hand the old cookies back.
    public static function setBan(
        PDO $pdo,
        SessionService $sessions,
        string $id,
        string $status,
        ?string $reason,
        ?string $by,
        ?int $until,
        bool $https,
        int $now,
        bool $clearCookies = true,
    ): void {
        if (!in_array($status, ['none', 'banned', 'timeout'], true)) {
            $status = 'banned';
        }
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $status, $reason, $by, $until, $now): void {
            if ($status === 'none') {
                Database::run(
                    $pdo,
                    'UPDATE accounts SET ban_status = \'none\', ban_reason = NULL, banned_at = NULL, banned_by = NULL, timeout_until = NULL WHERE id = ?',
                    [$id]
                );
                return;
            }
            Database::run(
                $pdo,
                'UPDATE accounts SET ban_status = ?, ban_reason = ?, banned_at = ?, banned_by = ?, timeout_until = ? WHERE id = ?',
                [
                    $status,
                    $reason,
                    Ids::utc($now),
                    $by,
                    $status === 'timeout' && $until !== null ? Ids::utc($until) : null,
                    $id,
                ]
            );
        });
        if ($status !== 'none') {
            $sessions->revokeAccount($pdo, $id, $https, $now, $clearCookies);
        }
    }

    public static function setRole(PDO $pdo, string $id, string $role): void
    {
        if ($role !== 'user' && $role !== 'admin') {
            throw new \InvalidArgumentException('role');
        }
        Database::privileged($pdo, static function (PDO $pdo) use ($id, $role): void {
            Database::run($pdo, 'UPDATE accounts SET role = ? WHERE id = ?', [$role, $id]);
        });
    }

    public static function savePasskeyLookup(PDO $pdo, string $credentialId, string $studentId): void
    {
        Database::run(
            $pdo,
            'INSERT INTO passkey_lookup (credential_id, student_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE student_id = VALUES(student_id)',
            [$credentialId, $studentId]
        );
    }

    public static function deletePasskeyLookup(PDO $pdo, array $credentialIds): void
    {
        foreach ($credentialIds as $id) {
            if (!is_string($id) || $id === '') {
                continue;
            }
            Database::run($pdo, 'DELETE FROM passkey_lookup WHERE credential_id = ?', [$id]);
        }
    }
}
