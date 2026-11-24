<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

final class NullDenyCache implements DenyCache
{
    public function until(string $key): ?int
    {
        return null;
    }

    public function remember(string $key, int $until): void
    {
    }
}
