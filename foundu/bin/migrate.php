<?php

declare(strict_types=1);

// Applies foundu/migrations/[0-9]*.sql in order and records them in
// schema_migrations. CLI only. On a host with no shell, use /install
// or import foundu/migrations/all.sql in phpMyAdmin.

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "migrate.php is command-line only\n");
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
use Foundu\Database;
use Foundu\Install\SqlScript;

$dryRun = false;
$database = null;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
        continue;
    }
    if (strncmp($arg, '--database=', 11) === 0) {
        $database = substr($arg, 11);
        continue;
    }
    fwrite(STDERR, "Unknown argument. Usage: php migrate.php [--dry-run] [--database=name]\n");
    exit(1);
}

if ($database !== null && !preg_match('/^[A-Za-z0-9_]+$/', $database)) {
    fwrite(STDERR, "Database name must be letters, digits, and underscore.\n");
    exit(1);
}

$config = Config::load($appRoot);
if ($database !== null) {
    $config['DB_NAME'] = $database;
}

$dir = $appRoot . '/migrations';
$files = glob($dir . '/[0-9]*.sql');
if ($files === false || $files === []) {
    fwrite(STDERR, "No numbered SQL files in migrations/\n");
    exit(1);
}
sort($files, SORT_STRING);

try {
    $pdo = Database::connection($config);
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
} catch (Throwable $e) {
    fwrite(STDERR, "Database connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

$applied = [];
$tableReady = false;
try {
    $pdo->query('SELECT filename, checksum FROM schema_migrations');
    $tableReady = true;
} catch (Throwable $e) {
    $tableReady = false;
}

if ($tableReady) {
    $rows = $pdo->query('SELECT filename, checksum FROM schema_migrations')->fetchAll();
    foreach ($rows as $row) {
        $applied[(string) $row['filename']] = (string) $row['checksum'];
    }
}

$did = 0;
$skipped = 0;
$insert = null;

foreach ($files as $path) {
    $name = basename($path);
    $sql = file_get_contents($path);
    if ($sql === false) {
        fwrite(STDERR, "Could not read {$name}\n");
        exit(1);
    }
    $checksum = hash('sha256', $sql);

    if (isset($applied[$name])) {
        if (!hash_equals($applied[$name], $checksum)) {
            fwrite(STDERR, "{$name} changed after it was applied. Refusing to run it again.\n");
            exit(1);
        }
        fwrite(STDOUT, "skip {$name}\n");
        $skipped++;
        continue;
    }

    $statements = SqlScript::split($sql);
    foreach ($statements as $index => $statement) {
        if (preg_match('/\bBEGIN\b/i', $statement) === 1 && preg_match('/\bEND\b/i', $statement) !== 1) {
            fwrite(STDERR, "{$name} statement " . ($index + 1) . " looks like a trigger that was split apart.\n");
            exit(1);
        }
    }

    if ($dryRun) {
        fwrite(STDOUT, "would apply {$name} (" . count($statements) . " statements)\n");
        $did++;
        continue;
    }

    try {
        foreach ($statements as $index => $statement) {
            $pdo->exec($statement);
        }
    } catch (Throwable $e) {
        $snippet = preg_replace('/\s+/', ' ', $statement ?? '') ?? '';
        if (strlen($snippet) > 180) {
            $snippet = substr($snippet, 0, 180) . '...';
        }
        fwrite(STDERR, "Failed in {$name} at statement " . (($index ?? 0) + 1) . ": " . $e->getMessage() . "\n");
        fwrite(STDERR, $snippet . "\n");
        exit(1);
    }

    if ($insert === null) {
        $insert = $pdo->prepare('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)');
    }
    $insert->execute([$name, $checksum]);
    fwrite(STDOUT, "applied {$name}\n");
    $did++;
}

fwrite(STDOUT, "done applied={$did} skipped={$skipped}\n");
exit(0);

