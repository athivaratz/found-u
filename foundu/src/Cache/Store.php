<?php

declare(strict_types=1);

namespace Foundu\Cache;

use RuntimeException;

// APCu when the host has it. Files under storage/cache otherwise.
// Counters that must survive every PHP process (rate limits) belong in
// MariaDB. That table arrives with the schema. There is no Redis.
final class Store
{
    public function __construct(
        private readonly string $dir,
        private readonly bool $allowApcu,
    ) {
    }

    public static function open(string $dir): self
    {
        $flag = getenv('FOUNDU_DISABLE_APCU');
        $allow = $flag !== '1' && $flag !== 'true';
        return new self($dir, $allow);
    }

    public function backend(): string
    {
        return $this->apcu() ? 'apcu' : 'file';
    }

    public function set(string $key, string $value, int $ttl): void
    {
        if ($ttl < 1) {
            throw new RuntimeException('cache ttl must be positive');
        }
        if ($this->apcu()) {
            if (!apcu_store($this->apcuKey($key), $value, $ttl)) {
                throw new RuntimeException('apcu store failed');
            }
            return;
        }
        if (!is_dir($this->dir) && !mkdir($this->dir, 0775, true) && !is_dir($this->dir)) {
            throw new RuntimeException('cache directory missing');
        }
        $payload = json_encode(['e' => time() + $ttl, 'v' => $value], JSON_THROW_ON_ERROR);
        $path = $this->path($key);
        if (file_put_contents($path, $payload, LOCK_EX) === false) {
            throw new RuntimeException('cache write failed');
        }
    }

    public function get(string $key): ?string
    {
        if ($this->apcu()) {
            $value = apcu_fetch($this->apcuKey($key), $ok);
            return $ok && is_string($value) ? $value : null;
        }
        $path = $this->path($key);
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data) || !isset($data['e'], $data['v']) || !is_string($data['v'])) {
            @unlink($path);
            return null;
        }
        if ((int) $data['e'] < time()) {
            @unlink($path);
            return null;
        }
        return $data['v'];
    }

    private function apcu(): bool
    {
        return $this->allowApcu && function_exists('apcu_enabled') && apcu_enabled();
    }

    private function apcuKey(string $key): string
    {
        return 'foundu.' . hash('sha256', $key);
    }

    private function path(string $key): string
    {
        return $this->dir . '/c_' . hash('sha256', $key);
    }
}
