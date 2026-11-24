<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Database;
use Foundu\Ids;
use PDO;

// Reads accounts with an explicit column list. Password and PIN hashes stay
// on the server. Profile JSON is built from the other columns.
final class Accounts
{
    public const READ_COLUMNS = 'id, student_id, linked_uid, email, display_name, photo_url, role,
        first_name, last_name, nickname, shown_name, is_student_verified, auth_methods,
        must_change_password, has_seen_tutorial, ban_status, ban_reason, banned_at, banned_by,
        timeout_until, school_password_hash, current_password_hash, has_logged_in_once, pin_hash,
        passkey_credentials, status, import_batch_id, grade_level, room_number, is_registered,
        created_at, updated_at';

    public static function byStudentId(PDO $pdo, string $studentId): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT ' . self::READ_COLUMNS . ' FROM accounts WHERE student_id = ? LIMIT 1',
            [$studentId]
        )->fetch();
        return is_array($row) ? self::normalize($row) : null;
    }

    public static function byId(PDO $pdo, string $id): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT ' . self::READ_COLUMNS . ' FROM accounts WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        return is_array($row) ? self::normalize($row) : null;
    }

    public static function emailFor(array $config, string $studentId): string
    {
        $domain = trim((string) ($config['SCHOOL_AUTH_DOMAIN'] ?? ''));
        if ($domain === '' || $domain === '-' || $domain === '—') {
            $host = parse_url((string) ($config['APP_URL'] ?? ''), PHP_URL_HOST);
            $domain = is_string($host) && $host !== '' ? $host : 'local';
        }
        $domain = strtolower($domain);
        return $studentId . '@students.' . $domain;
    }

    public static function blocked(array $row, int $now): bool
    {
        return ($row['status'] ?? '') !== 'active' || Actor::blocked($row, $now);
    }

    public static function profile(array $row): array
    {
        $role = ($row['role'] ?? '') === 'admin' ? 'admin' : 'user';
        $studentId = self::stringOrNull($row['student_id'] ?? null);
        $verified = self::flag($row['is_student_verified'] ?? 0);
        $profile = [
            'uid' => (string) $row['id'],
            'email' => (string) ($row['email'] ?? ''),
            'displayName' => (string) ($row['display_name'] ?? ''),
            'role' => $role,
            'hasSeenTutorial' => self::flag($row['has_seen_tutorial'] ?? 0),
            'banStatus' => (string) ($row['ban_status'] ?? 'none'),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
        ];
        $photo = self::stringOrNull($row['photo_url'] ?? null);
        if ($photo !== null) {
            $profile['photoURL'] = $photo;
        }
        if ($studentId !== null) {
            $profile['studentId'] = $studentId;
        }
        foreach ([
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'nickname' => 'nickname',
            'shownName' => 'shown_name',
        ] as $json => $column) {
            $value = self::stringOrNull($row[$column] ?? null);
            if ($value !== null) {
                $profile[$json] = $value;
            }
        }
        $profile['isStudentVerified'] = $verified || $role === 'admin' || $studentId !== null;
        $methods = $row['auth_methods'] ?? null;
        if (is_array($methods)) {
            $profile['authMethods'] = array_values(array_filter($methods, 'is_string'));
        }
        $profile['mustChangePassword'] = self::flag($row['must_change_password'] ?? 0);
        $reason = self::stringOrNull($row['ban_reason'] ?? null);
        if ($reason !== null) {
            $profile['banReason'] = $reason;
        }
        $bannedAt = self::iso($row['banned_at'] ?? null);
        if ($bannedAt !== null) {
            $profile['bannedAt'] = $bannedAt;
        }
        $bannedBy = self::stringOrNull($row['banned_by'] ?? null);
        if ($bannedBy !== null) {
            $profile['bannedBy'] = $bannedBy;
        }
        $timeout = self::iso($row['timeout_until'] ?? null);
        if ($timeout !== null) {
            $profile['timeoutUntil'] = $timeout;
        }
        return $profile;
    }

    public static function banView(array $row, int $now): array
    {
        $status = (string) ($row['ban_status'] ?? 'none');
        $blocked = Actor::blocked($row, $now);
        $remaining = 0;
        if ($status === 'timeout' && $blocked) {
            $until = Ids::unix((string) ($row['timeout_until'] ?? ''));
            if ($until > $now) {
                $remaining = (int) ceil(($until - $now) / 60);
            }
        }
        return [
            'banned' => $blocked && ($row['status'] ?? '') === 'active',
            'disabled' => ($row['status'] ?? '') === 'disabled',
            'banStatus' => $blocked ? $status : 'none',
            'banReason' => self::stringOrNull($row['ban_reason'] ?? null),
            'bannedAt' => self::iso($row['banned_at'] ?? null),
            'timeoutUntil' => self::iso($row['timeout_until'] ?? null),
            'timeoutRemaining' => $remaining,
        ];
    }

    public static function normalize(array $row): array
    {
        foreach (['auth_methods', 'passkey_credentials'] as $key) {
            $value = $row[$key] ?? null;
            if (is_string($value)) {
                $decoded = json_decode($value, true);
                $row[$key] = is_array($decoded) ? $decoded : [];
            } elseif (!is_array($value)) {
                $row[$key] = [];
            }
        }
        return $row;
    }

    public static function flag(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1';
    }

    public static function stringOrNull(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value === '' ? null : $value;
    }

    public static function iso(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        $unix = Ids::unix($value);
        if ($unix < 1) {
            return null;
        }
        return gmdate('Y-m-d\TH:i:s', $unix) . '.000Z';
    }
}
