<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\SessionRecord;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Ids;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

final class Logs
{
    private const ACTIONS = ['create', 'update', 'delete', 'view', 'login', 'logout', 'match', 'ban', 'unban', 'timeout', 'security'];
    private const TARGETS = ['lostItem', 'foundItem', 'category', 'location', 'contactType', 'user', 'system', 'match', 'error', 'nfcTag', 'nfcReport'];
    private const SEVERITIES = ['low', 'medium', 'high', 'critical'];
    private const SOURCES = ['client', 'server', 'api', 'database', 'unknown'];

    public static function register(App $app, \Closure $pdo): void
    {
        $app->get('/admin/activity-logs', static function ($request, $response) use ($pdo) {
            return self::activityList($request, $response, Gate::db($pdo));
        });
        $app->post('/activity-logs', static function ($request, $response) use ($pdo) {
            return self::activityCreate($request, $response, Gate::db($pdo));
        });
        $app->get('/admin/error-logs', static function ($request, $response) use ($pdo) {
            return self::errorList($request, $response, Gate::db($pdo));
        });
        $app->post('/error-logs', static function ($request, $response) use ($pdo) {
            return self::errorCreate($request, $response, Gate::db($pdo));
        });
        $app->patch('/admin/error-logs/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::errorResolve($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
    }

    private static function activityList(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('activity_logs', 'select', Gate::actor($request));
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 50, 200);
        [$where, $params] = self::window($request->getQueryParams(), $cursor, false);
        $sql = 'SELECT id, action, action_type, target_type, target_id, target_name, user_name, details, user_id, user_email, created_at
                FROM activity_logs' . $where . ' ORDER BY created_at DESC, id DESC';
        $rows = self::page($pdo, $sql, $params, $limit, $offset);
        $logs = [];
        foreach ($rows[0] as $row) {
            if (is_array($row)) {
                $logs[] = self::activity($row);
            }
        }
        return Reply::json($response, 200, ['logs' => $logs, 'nextCursor' => $rows[1]]);
    }

    private static function activityCreate(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('activity_logs', 'insert', $actor);
        $body = self::body($request);
        Values::only($body, ['action', 'actionType', 'targetType', 'targetId', 'targetName', 'userName', 'details', 'userId', 'userEmail']);
        if (isset($body['userId']) && $body['userId'] !== $actor->accountId) {
            throw new HttpError(403, 'forbidden');
        }
        $actionType = Values::text($body['actionType'] ?? null, 'actionType', 32, true);
        if (!in_array($actionType, self::ACTIONS, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'actionType']);
        }
        $targetType = Values::text($body['targetType'] ?? null, 'targetType', 32, true);
        if (!in_array($targetType, self::TARGETS, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'targetType']);
        }
        $details = Values::text($body['details'] ?? null, 'details', 2000, false);
        $id = Ids::uuid();
        $email = self::email($request);
        Feed::write($pdo, 'activity_logs', static function (PDO $pdo) use ($id, $body, $actionType, $targetType, $details, $actor, $email): void {
            Database::run(
                $pdo,
                'INSERT INTO activity_logs (
                    id, action, action_type, target_type, target_id, target_name, user_name, details, user_id, user_email
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $id,
                    Values::text($body['action'] ?? null, 'action', 255, true),
                    $actionType,
                    $targetType,
                    Values::text($body['targetId'] ?? null, 'targetId', 64, false),
                    Values::text($body['targetName'] ?? null, 'targetName', 255, false),
                    Values::text($body['userName'] ?? null, 'userName', 255, false),
                    $details === null ? null : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    $actor->accountId,
                    $email,
                ]
            );
        });
        return Reply::json($response, 201, ['id' => $id]);
    }

    private static function errorList(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('error_logs', 'select', Gate::actor($request));
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 50, 200);
        [$where, $params] = self::window($request->getQueryParams(), $cursor, true);
        $sql = 'SELECT id, message, stack, severity, source, url, user_id, user_email, user_agent, metadata, resolved, resolved_at, resolved_by, created_at
                FROM error_logs' . $where . ' ORDER BY created_at DESC, id DESC';
        $rows = self::page($pdo, $sql, $params, $limit, $offset);
        $logs = [];
        foreach ($rows[0] as $row) {
            if (is_array($row)) {
                $logs[] = self::error($row);
            }
        }
        return Reply::json($response, 200, ['logs' => $logs, 'nextCursor' => $rows[1]]);
    }

    private static function errorCreate(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('error_logs', 'insert', $actor);
        $body = self::body($request);
        Values::only($body, ['message', 'stack', 'severity', 'source', 'url', 'metadata', 'userId', 'userEmail']);
        if (isset($body['userId']) && $body['userId'] !== $actor->accountId) {
            throw new HttpError(403, 'forbidden');
        }
        $severity = isset($body['severity']) ? Values::text($body['severity'], 'severity', 16, true) : 'medium';
        if (!in_array($severity, self::SEVERITIES, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'severity']);
        }
        $source = isset($body['source']) ? Values::text($body['source'], 'source', 16, true) : 'unknown';
        if (!in_array($source, self::SOURCES, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'source']);
        }
        $metadata = null;
        if (array_key_exists('metadata', $body) && $body['metadata'] !== null) {
            if (!is_array($body['metadata']) || array_is_list($body['metadata'])) {
                throw new HttpError(400, 'invalid_input', ['field' => 'metadata']);
            }
            $metadata = json_encode($body['metadata'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if (strlen($metadata) > 4000) {
                throw new HttpError(400, 'invalid_input', ['field' => 'metadata']);
            }
        }
        $url = Values::httpsOrPath($body['url'] ?? null, 'url', false);
        $agent = substr($request->getHeaderLine('User-Agent'), 0, 512);
        $id = Ids::uuid();
        $email = self::email($request);
        $stack = Values::text($body['stack'] ?? null, 'stack', 8000, false);
        $message = Values::text($body['message'] ?? null, 'message', 2000, true);
        Feed::write($pdo, 'error_logs', static function (PDO $pdo) use ($id, $message, $stack, $severity, $source, $url, $actor, $email, $agent, $metadata): void {
            Database::run(
                $pdo,
                'INSERT INTO error_logs (
                    id, message, stack, severity, source, url, user_id, user_email, user_agent, metadata, resolved
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
                [$id, $message, $stack, $severity, $source, $url, $actor->accountId, $email, $agent !== '' ? $agent : null, $metadata]
            );
        });
        return Reply::json($response, 201, ['id' => $id]);
    }

    private static function errorResolve(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('error_logs', 'update', $actor);
        $id = Values::uuid($id, 'id', true);
        $body = self::body($request);
        Values::only($body, ['resolved']);
        $resolved = Values::bool($body['resolved'] ?? null, 'resolved') ? 1 : 0;
        $by = $actor->accountId;
        Feed::write($pdo, 'error_logs', static function (PDO $pdo) use ($id, $resolved, $by): void {
            $changed = Database::run(
                $pdo,
                'UPDATE error_logs SET resolved = ?, resolved_at = IF(? = 1, UTC_TIMESTAMP(3), NULL), resolved_by = IF(? = 1, ?, NULL) WHERE id = ?',
                [$resolved, $resolved, $resolved, $by, $id]
            )->rowCount();
            if ($changed > 0) {
                return;
            }
            $exists = Database::run($pdo, 'SELECT id FROM error_logs WHERE id = ? LIMIT 1', [$id])->fetch();
            if (!is_array($exists)) {
                throw new HttpError(404, 'not_found');
            }
        });
        $row = Database::run(
            $pdo,
            'SELECT id, message, stack, severity, source, url, user_id, user_email, user_agent, metadata, resolved, resolved_at, resolved_by, created_at
             FROM error_logs WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        return Reply::json($response, 200, ['log' => self::error(is_array($row) ? $row : [])]);
    }

    private static function window(array $query, ?array $cursor, bool $errors): array
    {
        $where = [];
        $params = [];
        if ($errors && isset($query['resolved']) && $query['resolved'] !== '') {
            if ($query['resolved'] !== '0' && $query['resolved'] !== '1') {
                throw new HttpError(400, 'invalid_input', ['field' => 'resolved']);
            }
            $where[] = 'resolved = ?';
            $params[] = (int) $query['resolved'];
        }
        if (isset($query['userId']) && $query['userId'] !== '') {
            $where[] = 'user_id = ?';
            $params[] = Values::uuid($query['userId'], 'userId', true);
        }
        if ($cursor !== null) {
            $where[] = '(created_at < ? OR (created_at = ? AND id < ?))';
            $params[] = $cursor[0];
            $params[] = $cursor[0];
            $params[] = $cursor[1];
        }
        $sql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        return [$sql, $params];
    }

    private static function page(PDO $pdo, string $sql, array $params, int $limit, ?int $offset): array
    {
        if ($offset !== null) {
            $sql .= ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            return [Database::run($pdo, $sql, $params)->fetchAll(), null];
        }
        $sql .= ' LIMIT ' . ($limit + 1);
        $rows = Database::run($pdo, $sql, $params)->fetchAll();
        return Page::next($rows, $limit);
    }

    private static function activity(array $row): array
    {
        $details = $row['details'] ?? null;
        if (is_string($details)) {
            $decoded = json_decode($details, true);
            $details = is_string($decoded) ? $decoded : $details;
        }
        return [
            'id' => (string) $row['id'],
            'action' => (string) $row['action'],
            'actionType' => $row['action_type'] !== null ? (string) $row['action_type'] : null,
            'targetType' => $row['target_type'] !== null ? (string) $row['target_type'] : null,
            'targetId' => $row['target_id'] !== null ? (string) $row['target_id'] : null,
            'targetName' => $row['target_name'] !== null ? (string) $row['target_name'] : null,
            'userName' => $row['user_name'] !== null ? (string) $row['user_name'] : null,
            'details' => is_string($details) ? $details : null,
            'userId' => $row['user_id'] !== null ? (string) $row['user_id'] : null,
            'userEmail' => $row['user_email'] !== null ? (string) $row['user_email'] : null,
            'createdAt' => Time::iso($row['created_at']),
        ];
    }

    private static function error(array $row): array
    {
        $metadata = Values::jsonObject($row['metadata'] ?? null);
        return [
            'id' => (string) ($row['id'] ?? ''),
            'message' => (string) ($row['message'] ?? ''),
            'stack' => isset($row['stack']) && $row['stack'] !== null ? (string) $row['stack'] : null,
            'severity' => (string) ($row['severity'] ?? 'medium'),
            'source' => (string) ($row['source'] ?? 'unknown'),
            'url' => isset($row['url']) && $row['url'] !== null ? (string) $row['url'] : null,
            'userId' => isset($row['user_id']) && $row['user_id'] !== null ? (string) $row['user_id'] : null,
            'userEmail' => isset($row['user_email']) && $row['user_email'] !== null ? (string) $row['user_email'] : null,
            'userAgent' => isset($row['user_agent']) && $row['user_agent'] !== null ? (string) $row['user_agent'] : null,
            'metadata' => $metadata,
            'resolved' => Values::flag($row['resolved'] ?? 0),
            'resolvedAt' => Time::iso($row['resolved_at'] ?? null),
            'resolvedBy' => isset($row['resolved_by']) && $row['resolved_by'] !== null ? (string) $row['resolved_by'] : null,
            'createdAt' => Time::iso($row['created_at'] ?? null),
        ];
    }

    private static function email(ServerRequestInterface $request): ?string
    {
        $session = $request->getAttribute(Attrs::SESSION);
        if (!$session instanceof SessionRecord || !is_array($session->account)) {
            return null;
        }
        $email = $session->account['email'] ?? null;
        return is_string($email) && $email !== '' ? $email : null;
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }
}
