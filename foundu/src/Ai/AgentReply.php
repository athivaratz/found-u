<?php

declare(strict_types=1);

namespace Foundu\Ai;

final class AgentReply
{
    public function __construct(
        public readonly string $text,
        public readonly array $calls,
        public readonly string $finishReason,
        public readonly string $provider,
        public readonly string $model,
    ) {
    }
}
