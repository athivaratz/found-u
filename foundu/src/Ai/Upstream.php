<?php

declare(strict_types=1);

namespace Foundu\Ai;

final class UpstreamResult
{
    public function __construct(
        public readonly int $status,
        public readonly string $body,
        public readonly ?string $error,
    ) {
    }

    public function ok(): bool
    {
        return $this->error === null && $this->status >= 200 && $this->status < 300 && $this->body !== '';
    }
}

interface Upstream
{
    public function request(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds): UpstreamResult;
}
