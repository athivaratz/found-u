<?php

declare(strict_types=1);

namespace Foundu\Auth;

use RuntimeException;

// One hasher for new passwords and PINs. password_verify accepts either
// result, so a hash made on a laptop still works on the host.
final class PasswordHash
{
    public static function hash(string $secret): string
    {
        if (defined('PASSWORD_ARGON2ID')) {
            $hash = password_hash($secret, PASSWORD_ARGON2ID, [
                'memory_cost' => 65536,
                'time_cost' => 4,
                'threads' => 1,
            ]);
            if (is_string($hash) && $hash !== '') {
                return $hash;
            }
        }

        $hash = password_hash($secret, PASSWORD_BCRYPT);
        if (!is_string($hash) || $hash === '') {
            throw new RuntimeException('password_hash failed');
        }
        return $hash;
    }

    public static function isBcrypt(string $hash): bool
    {
        return strncmp($hash, '$2', 2) === 0;
    }

    // A real Argon2id hash of a string we never store. password_verify runs
    // against this when the account has no hash, so a missing student id
    // does not return faster than a wrong password.
    public const DUMMY = '$argon2id$v=19$m=65536,t=4,p=1$TkFnZXZqZnE1YXJqamNrRA$zynfoWmZvVhn8pEER5/6u8OPPsamSFmMwT6Cas5DPZ8';

    public static function verify(string $secret, ?string $stored): bool
    {
        $hash = is_string($stored) && $stored !== '' ? $stored : self::DUMMY;
        $ok = password_verify($secret, $hash);
        if ($hash === self::DUMMY) {
            return false;
        }
        return $ok;
    }

    public static function needsRehash(string $hash): bool
    {
        if (defined('PASSWORD_ARGON2ID')) {
            return password_needs_rehash($hash, PASSWORD_ARGON2ID, [
                'memory_cost' => 65536,
                'time_cost' => 4,
                'threads' => 1,
            ]);
        }
        return password_needs_rehash($hash, PASSWORD_BCRYPT);
    }

    public static function fits(string $secret): bool
    {
        if (strlen($secret) < 1 || strlen($secret) > 128) {
            return false;
        }
        if (!defined('PASSWORD_ARGON2ID') && strlen($secret) > 72) {
            return false;
        }
        return true;
    }
}
