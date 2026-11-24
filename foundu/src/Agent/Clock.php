<?php

declare(strict_types=1);

namespace Foundu\Agent;

// Tests replace the clock so the wall-clock budget can trip without sleeping.
final class Clock
{
    public static ?\Closure $milliseconds = null;

    public static function ms(): int
    {
        if (self::$milliseconds !== null) {
            return (int) (self::$milliseconds)();
        }
        return (int) floor(microtime(true) * 1000);
    }

    public static function reset(): void
    {
        self::$milliseconds = null;
    }
}
