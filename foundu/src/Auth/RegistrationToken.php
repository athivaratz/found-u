<?php

declare(strict_types=1);

namespace Foundu\Auth;

// Fifteen minutes, HMAC-SHA256, bound to one student id. The key is APP_KEY.
// There is no fallback secret: an empty key refuses to mint a token.
final class RegistrationToken
{
    private const TTL = 900;

    public static function mint(string $key, string $studentId, int $now): ?string
    {
        if (strlen($key) < 32 || preg_match('/^\d{5}$/', $studentId) !== 1) {
            return null;
        }
        $exp = $now + self::TTL;
        $payload = $studentId . ':' . $exp;
        $sig = self::sign($key, $payload);
        return self::b64($payload . ':' . $sig);
    }

    public static function check(string $key, string $token, string $studentId, int $now): bool
    {
        if (strlen($key) < 32 || preg_match('/^\d{5}$/', $studentId) !== 1 || strlen($token) > 512) {
            return false;
        }
        $decoded = self::unb64($token);
        if ($decoded === null) {
            return false;
        }
        $last = strrpos($decoded, ':');
        if ($last === false || $last < 1) {
            return false;
        }
        $payload = substr($decoded, 0, $last);
        $sig = substr($decoded, $last + 1);
        $sep = strrpos($payload, ':');
        if ($sep === false) {
            return false;
        }
        $id = substr($payload, 0, $sep);
        $exp = substr($payload, $sep + 1);
        if (strlen($id) !== 5 || !hash_equals($studentId, $id)) {
            return false;
        }
        if (preg_match('/^\d+$/', $exp) !== 1 || (int) $exp < $now) {
            return false;
        }
        $expected = self::sign($key, $payload);
        if (strlen($sig) !== strlen($expected)) {
            return false;
        }
        return hash_equals($expected, $sig);
    }

    private static function sign(string $key, string $payload): string
    {
        return self::b64(hash_hmac('sha256', $payload, $key, true));
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function unb64(string $value): ?string
    {
        if ($value === '' || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
            return null;
        }
        $pad = strlen($value) % 4;
        if ($pad > 0) {
            $value .= str_repeat('=', 4 - $pad);
        }
        $raw = base64_decode(strtr($value, '-_', '+/'), true);
        return is_string($raw) ? $raw : null;
    }
}
