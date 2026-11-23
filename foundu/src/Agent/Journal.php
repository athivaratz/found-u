<?php

declare(strict_types=1);

namespace Foundu\Agent;

use Foundu\Auth\Actor;
use Foundu\Data\Feed;
use Foundu\Data\Time;
use Foundu\Database;
use Foundu\Ids;
use PDO;

final class Journal
{
    public static function write(
        PDO $pdo,
        Actor $actor,
        ?string $sessionId,
        array $requestMessages,
        array $result,
        int $durationMs,
        ?string $error,
    ): void {
        if ($actor->accountId === null) {
            return;
        }
        $id = Ids::uuid();
        $settings = [
            'agentProvider' => $result['provider'] ?? null,
            'agentModel' => $result['model'] ?? null,
            'finishReason' => $result['finishReason'] ?? null,
        ];
        try {
            Feed::write($pdo, 'agent_chat_logs', static function (PDO $pdo) use ($id, $actor, $sessionId, $requestMessages, $result, $settings, $durationMs, $error): void {
                Database::run(
                    $pdo,
                    'INSERT INTO agent_chat_logs (
                        id, user_id, session_id, provider, model, settings_snapshot, routing,
                        request_messages, response_parts, steps, truncated, finish_reason, error, duration_ms
                     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $id,
                        $actor->accountId,
                        $sessionId,
                        (string) ($result['provider'] ?? 'none'),
                        (string) ($result['model'] ?? ''),
                        json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                        json_encode(self::shrink($requestMessages), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR),
                        json_encode($result['parts'] ?? [], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR),
                        json_encode($result['steps'] ?? [], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                        !empty($result['truncated']) ? 1 : 0,
                        substr((string) ($result['finishReason'] ?? ''), 0, 64),
                        $error !== null ? substr($error, 0, 500) : null,
                        max(0, $durationMs),
                    ]
                );
            });
        } catch (\Throwable) {
            \Foundu\Log::get()->warning('agent chat log skipped');
        }
    }

    public static function latest(PDO $pdo, string $userId, string $sessionId): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT response_parts, truncated, created_at FROM agent_chat_logs
             WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1',
            [$userId, $sessionId]
        )->fetch();
        if (!is_array($row)) {
            return null;
        }
        $parts = json_decode((string) ($row['response_parts'] ?? 'null'), true);
        return [
            'parts' => is_array($parts) ? $parts : null,
            'truncated' => (int) ($row['truncated'] ?? 0) === 1,
            'createdAt' => Time::iso($row['created_at']),
        ];
    }

    public static function list(PDO $pdo, array $query): array
    {
        $where = ['created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)'];
        $params = [];
        if (($query['truncated'] ?? '') === '1') {
            $where[] = 'truncated = 1';
        }
        $session = Prompt::plain((string) ($query['sessionId'] ?? ''), 64);
        if ($session !== '') {
            $where[] = 'session_id = ?';
            $params[] = $session;
        }
        $user = (string) ($query['userId'] ?? '');
        if (preg_match('/^[0-9a-fA-F-]{36}$/', $user) === 1) {
            $where[] = 'user_id = ?';
            $params[] = $user;
        }
        $limit = (int) ($query['limit'] ?? 50);
        if ($limit < 1) {
            $limit = 50;
        }
        $limit = min($limit, 200);
        $rows = Database::run(
            $pdo,
            'SELECT id, user_id, session_id, provider, model, truncated, finish_reason, duration_ms, steps, created_at
             FROM agent_chat_logs WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC LIMIT ' . $limit,
            $params
        )->fetchAll();
        $logs = [];
        foreach ($rows as $row) {
            $logs[] = self::summary($row);
        }
        return $logs;
    }

    public static function one(PDO $pdo, string $id): ?array
    {
        if (preg_match('/^[0-9a-fA-F-]{36}$/', $id) !== 1) {
            return null;
        }
        $row = Database::run(
            $pdo,
            'SELECT id, user_id, session_id, provider, model, settings_snapshot, routing, request_messages,
                    response_parts, steps, truncated, finish_reason, error, duration_ms, created_at
             FROM agent_chat_logs WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            return null;
        }
        $log = self::summary($row);
        foreach (['settings_snapshot', 'routing', 'request_messages', 'response_parts', 'steps'] as $column) {
            $decoded = json_decode((string) ($row[$column] ?? 'null'), true);
            $log[$column] = $decoded === null ? null : $decoded;
        }
        $log['error'] = $row['error'] !== null ? (string) $row['error'] : null;
        return $log;
    }

    public static function purge(PDO $pdo): int
    {
        return Feed::write($pdo, 'agent_chat_logs', static function (PDO $pdo): int {
            return Database::run(
                $pdo,
                'DELETE FROM agent_chat_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)'
            )->rowCount();
        });
    }

    private static function summary(array $row): array
    {
        $steps = json_decode((string) ($row['steps'] ?? 'null'), true);
        return [
            'id' => (string) $row['id'],
            'user_id' => (string) $row['user_id'],
            'session_id' => $row['session_id'] !== null ? (string) $row['session_id'] : null,
            'provider' => (string) $row['provider'],
            'model' => $row['model'] !== null && $row['model'] !== '' ? (string) $row['model'] : null,
            'truncated' => (int) ($row['truncated'] ?? 0) === 1,
            'finish_reason' => $row['finish_reason'] !== null ? (string) $row['finish_reason'] : null,
            'duration_ms' => $row['duration_ms'] !== null ? (int) $row['duration_ms'] : null,
            'steps' => is_array($steps) ? $steps : null,
            'created_at' => Time::iso($row['created_at']),
        ];
    }

    private static function shrink(array $messages): array
    {
        $out = [];
        foreach (array_slice($messages, -12) as $message) {
            if (!is_array($message)) {
                continue;
            }
            $copy = ['role' => (string) ($message['role'] ?? '')];
            $text = self::textOf($message);
            if (strlen($text) > 1500) {
                $text = substr($text, 0, 1500) . '…';
            }
            $copy['text'] = $text;
            $out[] = $copy;
        }
        return $out;
    }

    public static function messageText(array $message): string
    {
        return self::textOf($message);
    }

    private static function textOf(array $message): string
    {
        if (is_string($message['content'] ?? null)) {
            return $message['content'];
        }
        $text = '';
        foreach ($message['parts'] ?? [] as $part) {
            if (is_array($part) && ($part['type'] ?? '') === 'text' && is_string($part['text'] ?? null)) {
                $text .= $part['text'];
            }
        }
        return $text;
    }
}
