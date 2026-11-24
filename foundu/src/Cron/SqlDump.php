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
        $plain = $path . '.plain';
        $cursor = ['bytes' => 0, 'table' => 0, 'offset' => 0, 'header' => false];
        try {
            $done = self::advance($pdo, $plain, $deadline, $cursor, 0);
            if (!$done) {
                throw new RuntimeException('dump exceeded its time budget');
            }
            self::gzip($plain, $path);
        } finally {
            if (is_file($plain)) {
                @unlink($plain);
            }
        }
    }

    // One slice of a dump. $cursor is the place the next call continues
    // from. A crash after the file grew but before the caller saved
    // $cursor is repaired by truncating back to cursor.bytes.
    // $rowBudget 0 means "as many rows as fit before $deadline".
    // Returns true when the file is a complete dump.
    public static function advance(PDO $pdo, string $path, int $deadline, array &$cursor, int $rowBudget): bool
    {
        $cursor += ['bytes' => 0, 'table' => 0, 'offset' => 0, 'header' => false, 'done' => false];
        if (($cursor['done'] ?? false) === true && is_file($path)) {
            return true;
        }
        $fp = fopen($path, 'c+b');
        if ($fp === false) {
            throw new RuntimeException('could not open dump');
        }
        $committed = max(0, (int) $cursor['bytes']);
        try {
            if (!ftruncate($fp, $committed) || fseek($fp, $committed) !== 0) {
                throw new RuntimeException('could not open dump');
            }
            if ($cursor['header'] !== true) {
                self::put($fp, 'SET @foundu_allow_privileged = 1;');
                self::put($fp, "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;");
                self::put($fp, "SET time_zone = '+00:00';");
                self::put($fp, "SET FOREIGN_KEY_CHECKS = 0;");
                self::put($fp, "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';");
                $cursor['header'] = true;
                $cursor['bytes'] = (int) ftell($fp);
            }
            $schema = $pdo->query('SELECT DATABASE()')->fetchColumn();
            $schema = is_string($schema) ? $schema : '';
            $tables = $pdo->prepare(
                'SELECT table_name FROM information_schema.tables
                 WHERE table_schema = ? AND table_type = \'BASE TABLE\' ORDER BY table_name'
            );
            $tables->execute([$schema]);
            $names = $tables->fetchAll(PDO::FETCH_COLUMN);
            $index = max(0, (int) $cursor['table']);
            $offset = max(0, (int) $cursor['offset']);
            $written = 0;
            $count = count($names);
            while ($index < $count) {
                if (time() >= $deadline || ($rowBudget > 0 && $written >= $rowBudget)) {
                    $cursor['table'] = $index;
                    $cursor['offset'] = $offset;
                    $cursor['bytes'] = (int) ftell($fp);
                    return false;
                }
                $name = $names[$index];
                if (!is_string($name) || !self::ident($name)) {
                    $index++;
                    $offset = 0;
                    continue;
                }
                $room = $rowBudget > 0 ? $rowBudget - $written : 40;
                $chunk = self::tableChunk($pdo, $fp, $schema, $name, $offset, $room);
                $written += $chunk['rows'];
                $offset = $chunk['offset'];
                $cursor['table'] = $index;
                $cursor['offset'] = $offset;
                $cursor['bytes'] = (int) ftell($fp);
                if (!$chunk['done']) {
                    // The table still has rows. The checks at the top of the
                    // loop decide whether another batch fits in this run.
                    continue;
                }
                $index++;
                $offset = 0;
                $cursor['table'] = $index;
                $cursor['offset'] = 0;
                $cursor['bytes'] = (int) ftell($fp);
            }
            self::put($fp, 'SET FOREIGN_KEY_CHECKS = 1;');
            self::put($fp, 'SET @foundu_allow_privileged = NULL;');
            $cursor['bytes'] = (int) ftell($fp);
            $cursor['done'] = true;
            return true;
        } finally {
            fclose($fp);
        }
    }

    public static function gzip(string $plain, string $path): void
    {
        if (!function_exists('gzopen')) {
            throw new RuntimeException('gzip is not available');
        }
        $in = fopen($plain, 'rb');
        $gz = gzopen($path, 'wb6');
        if ($in === false || $gz === false) {
            if ($in !== false) {
                fclose($in);
            }
            if ($gz !== false) {
                gzclose($gz);
            }
            throw new RuntimeException('could not open dump');
        }
        try {
            while (!feof($in)) {
                $chunk = fread($in, 65536);
                if (!is_string($chunk) || $chunk === '') {
                    break;
                }
                gzwrite($gz, $chunk);
            }
        } finally {
            fclose($in);
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
        // Account deletes and inserts are refused unless this session
        // variable is set. The dump file sets it too, for phpMyAdmin.
        $pdo->exec('SET @foundu_allow_privileged = 1');
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

    private static function tableChunk(PDO $pdo, $fp, string $schema, string $name, int $offset, int $maxRows): array
    {
        $columns = $pdo->prepare(
            'SELECT column_name, data_type FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position'
        );
        $columns->execute([$schema, $name]);
        $defs = $columns->fetchAll();
        if ($defs === []) {
            return ['rows' => 0, 'offset' => 0, 'done' => true];
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
        if ($offset === 0) {
            self::put($fp, 'DELETE FROM `' . $name . '`;');
        }
        $limit = max(1, min(40, $maxRows));
        $select = $pdo->query(
            'SELECT ' . implode(', ', $quoted) . ' FROM `' . $name . '` ORDER BY 1 LIMIT ' . ($limit + 1) . ' OFFSET ' . $offset
        );
        $batch = [];
        $count = 0;
        while ($count < $limit) {
            $row = $select->fetch(PDO::FETCH_NUM);
            if ($row === false) {
                break;
            }
            $values = [];
            foreach ($row as $index => $value) {
                $values[] = self::literal($pdo, $value, $types[$index] ?? '');
            }
            $batch[] = '(' . implode(',', $values) . ')';
            $count++;
        }
        $more = $select->fetch(PDO::FETCH_NUM) !== false;
        if ($batch !== []) {
            self::put($fp, 'INSERT INTO `' . $name . '` (' . implode(',', $quoted) . ') VALUES ' . implode(',', $batch) . ';');
        }
        return [
            'rows' => $count,
            'offset' => $offset + $count,
            'done' => !$more,
        ];
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

    private static function put($fp, string $sql): void
    {
        fwrite($fp, $sql . "\n");
    }
}
