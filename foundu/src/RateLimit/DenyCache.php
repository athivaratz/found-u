<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

interface DenyCache
{
    public function until(string $key): ?int;

    public function remember(string $key, int $until): void;
}
