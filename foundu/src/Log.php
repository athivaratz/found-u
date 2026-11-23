<?php

declare(strict_types=1);

namespace Foundu;

use Monolog\Handler\ErrorLogHandler;
use Monolog\Level;
use Monolog\Logger;

final class Log
{
    private static ?Logger $logger = null;

    public static function get(): Logger
    {
        if (self::$logger instanceof Logger) {
            return self::$logger;
        }
        $logger = new Logger('foundu');
        $logger->pushHandler(new ErrorLogHandler(ErrorLogHandler::OPERATING_SYSTEM, Level::Debug));
        self::$logger = $logger;
        return $logger;
    }
}
