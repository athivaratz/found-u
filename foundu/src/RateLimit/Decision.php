<?php

declare(strict_types=1);

namespace Foundu\RateLimit;

final class Decision
{
    public function __construct(
        public readonly bool $allowed,
        public readonly int $hits,
        public readonly int $limit,
        public readonly int $retryAfter,
    ) {
    }
}
