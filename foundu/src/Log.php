<?php

declare(strict_types=1);

namespace Foundu;

use Monolog\Handler\ErrorLogHandler;
use Monolog\Handler\RotatingFileHandler;
use Monolog\Level;
use Monolog\LogRecord;
use Monolog\Logger;

final class Log
{
    private static ?Logger $logger = null;
    private static bool $ready = false;

    public static function open(string $appRoot): Logger
    {
        if (self::$ready && self::$logger instanceof Logger) {
            return self::$logger;
        }
        $dir = $appRoot . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $logger = new Logger('foundu');
        $logger->pushProcessor(static function (LogRecord $record): LogRecord {
            return $record->with(
                context: Redact::context($record->context),
                extra: Redact::context($record->extra)
            );
        });
        if (is_dir($dir) && is_writable($dir)) {
            $logger->pushHandler(new RotatingFileHandler(
                $dir . '/app.log',
                14,
                Level::Info,
                true,
                0664,
                true
            ));
        }
        $logger->pushHandler(new ErrorLogHandler(ErrorLogHandler::OPERATING_SYSTEM, Level::Warning));
        self::$logger = $logger;
        self::$ready = true;
        return $logger;
    }

    public static function get(): Logger
    {
        if (self::$logger instanceof Logger) {
            return self::$logger;
        }
        return self::open(dirname(__DIR__));
    }
}
