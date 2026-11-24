<?php

declare(strict_types=1);

// DirectAdmin cron, one line:
//   */5 * * * * php ~/foundu/bin/cron.php
// Overlapping runs exit 0 immediately. A crash keeps the lock until it
// expires (10 minutes), then the next run takes the row.
// Item expiry, chat-log purge, the Cloudflare IP refresh, and the database
// dump run in this file after the short cleanup. Do not add a second entry.
// The whole run is meant to finish inside the host's 30 second limit.
// A database dump that does not finish is continued on the next run.

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "cron.php is command-line only\n");
    exit(1);
}

$appRoot = dirname(__DIR__);
$autoload = $appRoot . '/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "vendor/autoload.php is missing. Run composer install on the build machine.\n");
    exit(1);
}
require $autoload;

use Foundu\Config;
use Foundu\Cron\Cleanup;
use Foundu\Cron\Lock;
use Foundu\Cron\Tasks;
use Foundu\Database;
use Foundu\Log;

Log::open($appRoot);
$config = Config::load($appRoot);

try {
    $pdo = Database::connection($config);
} catch (Throwable $e) {
    Log::get()->error('cron could not reach the database', ['class' => $e::class]);
    fwrite(STDERR, "cron could not reach the database\n");
    exit(1);
}

$now = time();
$lock = new Lock();
$owner = $lock->tryAcquire($pdo, 'cron', 600, $now);
if ($owner === null) {
    fwrite(STDOUT, "cron busy\n");
    exit(0);
}

try {
    $absolute = Config::int($config, 'SESSION_ABSOLUTE_SECONDS', 43200, 300, 1209600);
    $counts = Cleanup::run($pdo, $now, $absolute);
    foreach ($counts as $name => $count) {
        fwrite(STDOUT, $name . ' ' . $count . "\n");
    }
    $lines = Tasks::run($pdo, $config, $appRoot, $now);
    foreach ($lines as $line) {
        fwrite(STDOUT, $line . "\n");
    }
    Log::get()->info('cron finished', $counts + ['tasks' => $lines]);
    $cache = $appRoot . '/storage/cache';
    if (!is_dir($cache)) {
        @mkdir($cache, 0775, true);
    }
    if (is_dir($cache) && is_writable($cache)) {
        @file_put_contents($cache . '/cron-last-run', (string) $now);
    }
} catch (Throwable $e) {
    Log::get()->error('cron failed', ['class' => $e::class]);
    fwrite(STDERR, "cron failed\n");
    $lock->release($pdo, 'cron', $owner);
    exit(1);
}

$lock->release($pdo, 'cron', $owner);
exit(0);
