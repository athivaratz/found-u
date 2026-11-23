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
}
