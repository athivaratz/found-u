<?php

declare(strict_types=1);

namespace Foundu\Install;

final class Token
{
    public static function matches(string $appRoot, string $given): bool
    {
        $path = Lock::tokenPath($appRoot);
        $known = is_file($path) ? trim((string) file_get_contents($path)) : '';
        $given = trim($given);
        if (preg_match('/^[a-f0-9]{64}$/', $known) !== 1) {
            hash_equals(str_repeat('a', 64), str_repeat('b', 64));
            return false;
        }
        if (preg_match('/^[a-f0-9]{64}$/', $given) !== 1) {
            hash_equals($known, str_repeat('0', 64));
            return false;
        }
        return hash_equals($known, $given);
    }
}
