<?php

declare(strict_types=1);

namespace Foundu\Http;

use RuntimeException;

// A response we meant to send. The message is a short code, not a sentence
// and not a stack trace. Extra keys are copied into the JSON body.
final class HttpError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $error,
        public readonly array $extra = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($error, $status);
    }

    public static function tooMany(int $retryAfter): self
    {
        $retryAfter = max(1, $retryAfter);
        return new self(
            429,
            'too_many_requests',
            ['retryAfterMs' => $retryAfter * 1000],
            ['Retry-After' => (string) $retryAfter]
        );
    }
}
