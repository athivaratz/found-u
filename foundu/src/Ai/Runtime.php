<?php

declare(strict_types=1);

namespace Foundu\Ai;

// Tests replace the transport. Production leaves it null and uses cURL.
final class Runtime
{
    public static ?Upstream $upstream = null;

    public static function upstream(): Upstream
    {
        return self::$upstream ?? new CurlUpstream();
    }

    public static function reset(): void
    {
        self::$upstream = null;
    }
}
