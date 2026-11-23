<?php

declare(strict_types=1);

// Applies foundu/migrations/[0-9]*.sql in order and records them in
// schema_migrations. CLI only. On a host with no shell, import
// foundu/migrations/all.sql in phpMyAdmin instead. There is no web route.

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

    $statements = split_sql($sql);
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

/**
 * Split a script the way the mysql client does, including DELIMITER.
 * Strings and comments are not split. The delimiter itself is not executed.
 *
 * @return list<string>
 */
function split_sql(string $sql): array
{
    $len = strlen($sql);
    $i = 0;
    $delimiter = ';';
    $buf = '';
    $state = 'code';
    $out = [];

    $flush = static function () use (&$buf, &$out): void {
        $stmt = trim($buf);
        $buf = '';
        if ($stmt === '' || sql_code_is_empty($stmt)) {
            return;
        }
        $out[] = $stmt;
    };

    while ($i < $len) {
        $c = $sql[$i];
        $n = $i + 1 < $len ? $sql[$i + 1] : '';

        if ($state === 'line') {
            $buf .= $c;
            $i++;
            if ($c === "\n") {
                $state = 'code';
            }
            continue;
        }

        if ($state === 'block') {
            if ($c === '*' && $n === '/') {
                $buf .= '*/';
                $i += 2;
                $state = 'code';
                continue;
            }
            $buf .= $c;
            $i++;
            continue;
        }

        if ($state === 'sq') {
            if ($c === '\\' && $n !== '') {
                $buf .= $c . $n;
                $i += 2;
                continue;
            }
            if ($c === "'" && $n === "'") {
                $buf .= "''";
                $i += 2;
                continue;
            }
            $buf .= $c;
            $i++;
            if ($c === "'") {
                $state = 'code';
            }
            continue;
        }

        if ($state === 'dq') {
            if ($c === '\\' && $n !== '') {
                $buf .= $c . $n;
                $i += 2;
                continue;
            }
            if ($c === '"' && $n === '"') {
                $buf .= '""';
                $i += 2;
                continue;
            }
            $buf .= $c;
            $i++;
            if ($c === '"') {
                $state = 'code';
            }
            continue;
        }

        if ($c === "'") {
            $state = 'sq';
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '"') {
            $state = 'dq';
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '#') {
            $state = 'line';
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '-' && $n === '-') {
            $state = 'line';
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '/' && $n === '*') {
            $state = 'block';
            $buf .= '/*';
            $i += 2;
            continue;
        }

        if (sql_code_is_empty($buf) && ($c === 'D' || $c === 'd')) {
            if (preg_match('/\Gdelimiter\s+(\S+)/i', $sql, $match, 0, $i) === 1) {
                $delimiter = $match[1];
                $i += strlen($match[0]);
                while ($i < $len && $sql[$i] !== "\n") {
                    $i++;
                }
                if ($i < $len && $sql[$i] === "\n") {
                    $i++;
                }
                continue;
            }
        }

        $dlen = strlen($delimiter);
        if ($dlen > 0 && substr($sql, $i, $dlen) === $delimiter) {
            $flush();
            $i += $dlen;
            continue;
        }

        $buf .= $c;
        $i++;
    }

    $flush();
    return $out;
}

function sql_code_is_empty(string $buf): bool
{
    $stripped = preg_replace('/\/\*.*?\*\//s', '', $buf) ?? $buf;
    $stripped = preg_replace('/--[^\n]*(\n|$)/', "\n", $stripped) ?? $stripped;
    $stripped = preg_replace('/#[^\n]*(\n|$)/', "\n", $stripped) ?? $stripped;
    return trim($stripped) === '';
}
