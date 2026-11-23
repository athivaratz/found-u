<?php

declare(strict_types=1);

namespace Foundu\Cron;

use PDO;
use RuntimeException;

// A mysqldump stand-in for a host where exec() is disabled.
// Rows are written as INSERT statements and gzipped as they go, so the
// dump is not held in memory. Restore runs one statement at a time.
final class SqlDump
{
    public static function write(PDO $pdo, string $path, int $deadline): void
    {
        if (!function_exists('gzopen')) {
            throw new RuntimeException('gzip is not available');
        }
        $gz = gzopen($path, 'wb9');
        if ($gz === false) {
            throw new RuntimeException('could not open dump');
        }
        try {
            self::line($gz, "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;");
            self::line($gz, "SET time_zone = '+00:00';");
            self::line($gz, "SET FOREIGN_KEY_CHECKS = 0;");
            self::line($gz, "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';");
            $schema = $pdo->query('SELECT DATABASE()')->fetchColumn();
            $schema = is_string($schema) ? $schema : '';
            $tables = $pdo->prepare(
                'SELECT table_name FROM information_schema.tables
                 WHERE table_schema = ? AND table_type = \'BASE TABLE\' ORDER BY table_name'
            );
            $tables->execute([$schema]);
            $names = $tables->fetchAll(PDO::FETCH_COLUMN);
            foreach ($names as $name) {
                if (time() >= $deadline) {
                    throw new RuntimeException('dump exceeded its time budget');
                }
                if (!is_string($name) || !self::ident($name)) {
                    continue;
                }
                self::table($pdo, $gz, $schema, $name, $deadline);
            }
            self::line($gz, 'SET FOREIGN_KEY_CHECKS = 1;');
        } finally {
            gzclose($gz);
        }
    }

    public static function restore(PDO $pdo, string $path): void
    {
        if (!function_exists('gzopen')) {
            throw new RuntimeException('gzip is not available');
        }
        $gz = gzopen($path, 'rb');
        if ($gz === false) {
            throw new RuntimeException('could not open dump');
        }
        $sql = '';
        $quote = '';
        $escape = false;
        try {
            while (!gzeof($gz)) {
                $chunk = gzread($gz, 8192);
                if (!is_string($chunk) || $chunk === '') {
                    break;
                }
                $length = strlen($chunk);
                for ($i = 0; $i < $length; $i++) {
                    $char = $chunk[$i];
                    if ($quote !== '') {
                        $sql .= $char;
                        if ($escape) {
                            $escape = false;
                            continue;
                        }
                        if ($char === '\\') {
                            $escape = true;
                            continue;
                        }
                        if ($char === $quote) {
                            $quote = '';
                        }
                        continue;
                    }
                    if ($char === "'" || $char === '"') {
                        $quote = $char;
                        $sql .= $char;
                        continue;
                    }
                    if ($char === ';') {
                        $statement = trim($sql);
                        $sql = '';
                        if ($statement !== '') {
                            $pdo->exec($statement);
                        }
                        continue;
                    }
                    $sql .= $char;
                }
            }
            $tail = trim($sql);
            if ($tail !== '') {
                $pdo->exec($tail);
            }
        } finally {
            gzclose($gz);
        }
    }

    private static function table(PDO $pdo, $gz, string $schema, string $name, int $deadline): void
    {
        $columns = $pdo->prepare(
            'SELECT column_name, data_type FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position'
        );
        $columns->execute([$schema, $name]);
        $defs = $columns->fetchAll();
        if ($defs === []) {
            return;
        }
        $quoted = [];
        $types = [];
        foreach ($defs as $def) {
            if (!is_array($def)) {
                continue;
            }
            $column = (string) $def['column_name'];
            if (!self::ident($column)) {
                continue;
            }
            $quoted[] = '`' . $column . '`';
            $types[] = strtolower((string) $def['data_type']);
        }
        self::line($gz, 'DELETE FROM `' . $name . '`;');
        $select = $pdo->query('SELECT ' . implode(', ', $quoted) . ' FROM `' . $name . '`');
        $batch = [];
        $batchRows = 0;
        while (true) {
            $row = $select->fetch(PDO::FETCH_NUM);
            if ($row === false) {
                break;
            }
            if (time() >= $deadline) {
                throw new RuntimeException('dump exceeded its time budget');
            }
            $values = [];
            foreach ($row as $index => $value) {
                $values[] = self::literal($pdo, $value, $types[$index] ?? '');
            }
            $batch[] = '(' . implode(',', $values) . ')';
            $batchRows++;
            if ($batchRows >= 40) {
                self::insert($gz, $name, $quoted, $batch);
                $batch = [];
                $batchRows = 0;
            }
        }
        if ($batch !== []) {
            self::insert($gz, $name, $quoted, $batch);
        }
    }

    private static function insert($gz, string $name, array $quoted, array $batch): void
    {
        self::line($gz, 'INSERT INTO `' . $name . '` (' . implode(',', $quoted) . ') VALUES ' . implode(',', $batch) . ';');
    }

    private static function literal(PDO $pdo, mixed $value, string $type): string
    {
        if ($value === null) {
            return 'NULL';
        }
        $binary = in_array($type, ['binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob'], true);
        if ($binary) {
            return '0x' . bin2hex((string) $value);
        }
        $numeric = in_array($type, [
            'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint',
            'decimal', 'numeric', 'float', 'double', 'bit',
        ], true);
        if ($numeric && is_string($value) && preg_match('/^-?\d+(?:\.\d+)?$/', $value) === 1) {
            return $value;
        }
        if ($numeric && (is_int($value) || is_float($value))) {
            return (string) $value;
        }
        $quoted = $pdo->quote((string) $value);
        return $quoted === false ? "''" : $quoted;
    }

    private static function ident(string $name): bool
    {
        return preg_match('/^[A-Za-z0-9_]+$/', $name) === 1;
    }

    private static function line($gz, string $sql): void
    {
        gzwrite($gz, $sql . "\n");
    }
}
