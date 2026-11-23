<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

// Remembers a denial until the window ends. It never grants a request.
// Missing APCu, or FOUNDU_DISABLE_APCU, means every decision hits MariaDB.
final class ApcuDenyCache implements DenyCache
{
    public function until(string $key): ?int
    {
        if (!$this->on()) {
            return null;
        }
        $value = apcu_fetch($this->key($key), $ok);
        if (!$ok || !is_int($value)) {
            return null;
        }
        return $value;
    }

    public function remember(string $key, int $until): void
    {
        if (!$this->on()) {
            return;
        }
        $ttl = max(1, $until - time());
        apcu_store($this->key($key), $until, $ttl);
    }

    public static function fromEnvironment(): DenyCache
    {
        $flag = getenv('FOUNDU_DISABLE_APCU');
        if ($flag === '1' || $flag === 'true') {
            return new NullDenyCache();
        }
        $cache = new self();
        return $cache->on() ? $cache : new NullDenyCache();
    }

    private function on(): bool
    {
        return function_exists('apcu_enabled') && apcu_enabled();
    }

    private function key(string $key): string
    {
        return 'foundu.rl.' . hash('sha256', $key);
    }
}
