<?php

declare(strict_types=1);

namespace Foundu\Http;

final class CookieQueue
{
    /** @var list<string> */
    public array $lines = [];

    public function add(string $line): void
    {
        $this->lines[] = $line;
    }

    public function addAll(array $lines): void
    {
        foreach ($lines as $line) {
            if (is_string($line) && $line !== '') {
                $this->lines[] = $line;
            }
        }
    }
}
