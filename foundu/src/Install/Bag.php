<?php

declare(strict_types=1);

namespace Foundu\Install;

// The installer session. The web entry points this at $_SESSION.
// Tests pass their own array. Nothing here is written to the app log.
final class Bag
{
    public function __construct(private array &$data)
    {
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->data[$key] ?? $default;
    }

    public function set(string $key, mixed $value): void
    {
        $this->data[$key] = $value;
    }

    public function forget(string $key): void
    {
        unset($this->data[$key]);
    }
}
