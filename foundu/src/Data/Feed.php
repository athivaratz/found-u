<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Database;
use Foundu\Http\HttpError;
use Foundu\Log;
use PDO;
use PDOException;
use Throwable;

// change_feed has one row per table the client may poll. Triggers also move
// updated_at, and every write in this phase bumps the same row before
// commit so a rollback takes the stamp with it.
final class Feed
{
    public const NAMES = [
        'accounts',
        'admin_whitelist',
        'agent_chat_logs',
        'ai_usage',
        'activity_logs',
        'app_settings',
        'articles',
        'categories',
        'contact_types',
        'drop_off_locations',
        'error_logs',
        'found_items',
        'help_pages',
        'help_sections',
        'locations',
        'lost_items',
        'match_dismissals',
        'nfc_found_reports',
        'nfc_tags',
    ];

    public static function write(PDO $pdo, string $table, callable $work): mixed
    {
        self::known($table);
        $pdo->beginTransaction();
        try {
            $result = $work($pdo);
            self::bump($pdo, $table);
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof PDOException) {
                $state = (string) ($e->errorInfo[0] ?? $e->getCode());
                if ($state === '23000') {
                    throw new HttpError(409, 'conflict');
                }
                Log::get()->error('data write failed', ['sqlstate' => $state]);
                throw new HttpError(500, 'server_error');
            }
            throw $e;
        }
    }

    public static function bump(PDO $pdo, string $table): void
    {
        self::known($table);
        Database::run(
            $pdo,
            'UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = ?',
            [$table]
        );
    }

    public static function read(PDO $pdo, array $names): array
    {
        if ($names === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tables']);
        }
        $unique = [];
        foreach ($names as $name) {
            if (!is_string($name) || !in_array($name, self::NAMES, true)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'tables']);
            }
            $unique[$name] = true;
        }
        if (count($unique) > 20) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tables']);
        }
        $keys = array_keys($unique);
        sort($keys, SORT_STRING);
        $marks = implode(',', array_fill(0, count($keys), '?'));
        $rows = Database::run(
            $pdo,
            'SELECT table_name, updated_at FROM change_feed WHERE table_name IN (' . $marks . ') ORDER BY table_name',
            $keys
        )->fetchAll();
        $tables = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $tables[(string) $row['table_name']] = Time::iso($row['updated_at']);
        }
        return ['tables' => $tables];
    }

    private static function known(string $table): void
    {
        if (!in_array($table, self::NAMES, true)) {
            throw new HttpError(500, 'server_error');
        }
    }
}
