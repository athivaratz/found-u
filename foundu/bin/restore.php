<?php

declare(strict_types=1);

// Restores a dump made by bin/cron.php. No exec(), no mysql client.
// On a machine that has PHP:
//   php foundu/bin/restore.php /path/to/foundu-YYYYMMDDTHHMMSSZ.sql.gz
// The file may be the .sql.gz from R2, or the plain .sql after gunzip.
// This replaces every table in the current database. Take a copy first.

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "restore.php is command-line only\n");
    exit(1);
}

$appRoot = dirname(__DIR__);
$autoload = $appRoot . '/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "vendor/autoload.php is missing\n");
    exit(1);
}
require $autoload;

use Foundu\Config;
use Foundu\Cron\SqlDump;
use Foundu\Database;

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "usage: php bin/restore.php dump.sql.gz\n");
    exit(1);
}

$gz = $path;
$temporary = null;
if (!str_ends_with(strtolower($path), '.gz')) {
    $temporary = $path . '.restore.gz';
    SqlDump::gzip($path, $temporary);
    $gz = $temporary;
}

try {
    $pdo = Database::connection(Config::load($appRoot));
    SqlDump::restore($pdo, $gz);
} catch (Throwable $e) {
    fwrite(STDERR, "restore failed\n");
    if ($temporary !== null && is_file($temporary)) {
        @unlink($temporary);
    }
    exit(1);
}

if ($temporary !== null && is_file($temporary)) {
    @unlink($temporary);
}
fwrite(STDOUT, "restored\n");
exit(0);
