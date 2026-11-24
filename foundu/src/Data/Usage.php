<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Ids;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// Quota rows the browser used to count itself. Admin can list them. A signed-in
// user can insert a row for their own account. Deletes stay on the cron job.
final class Usage
{
    public static function register(App $app, \Closure $pdo): void
    {
        $app->get('/admin/ai-usage', static function ($request, $response) use ($pdo) {
            return self::list($request, $response, Gate::db($pdo));
        });
        $app->post('/ai-usage', static function ($request, $response) use ($pdo) {
            return self::create($request, $response, Gate::db($pdo));
        });
    }

    private static function list(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('ai_usage', 'select', Gate::actor($request));
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 100, 100);
        $where = [];
        $params = [];
        if ($cursor !== null) {
            $where[] = '(created_at < ? OR (created_at = ? AND id < ?))';
            $params[] = $cursor[0];
            $params[] = $cursor[0];
            $params[] = $cursor[1];
        }
        $sql = 'SELECT id, user_id, endpoint, created_at FROM ai_usage';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY created_at DESC, id DESC';
        if ($offset !== null) {
            $sql .= ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            $next = null;
        } else {
            $sql .= ' LIMIT ' . ($limit + 1);
            [$rows, $next] = Page::next(Database::run($pdo, $sql, $params)->fetchAll(), $limit);
        }
        $records = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $records[] = [
                'id' => (string) $row['id'],
                'userId' => (string) $row['user_id'],
                'endpoint' => (string) $row['endpoint'],
                'createdAt' => Time::iso($row['created_at']),
            ];
        }
        return Reply::json($response, 200, ['records' => $records, 'nextCursor' => $next]);
    }

    private static function create(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        Values::only($body, ['userId', 'endpoint']);
        if (isset($body['userId']) && $body['userId'] !== $actor->accountId) {
            throw new HttpError(403, 'forbidden');
        }
        Gate::demand('ai_usage', 'insert', $actor, ['user_id' => $actor->accountId]);
        $endpoint = Values::text($body['endpoint'] ?? 'ner', 'endpoint', 32, true);
        $id = Ids::uuid();
        $userId = $actor->accountId;
        Feed::write($pdo, 'ai_usage', static function (PDO $pdo) use ($id, $userId, $endpoint): void {
            Database::run(
                $pdo,
                'INSERT INTO ai_usage (id, user_id, endpoint) VALUES (?, ?, ?)',
                [$id, $userId, $endpoint]
            );
        });
        return Reply::json($response, 201, ['id' => $id]);
    }
}
