<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\AccountWriter;
use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Auth\SessionService;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Http\Https;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

final class People
{
    private const COLUMNS = 'id, email, display_name, photo_url, role, student_id, first_name, last_name, nickname, shown_name, is_student_verified, auth_methods, must_change_password, has_seen_tutorial, ban_status, ban_reason, banned_at, banned_by, timeout_until, created_at, updated_at';

    public static function register(App $app, array $config, \Closure $pdo, SessionService $sessions): void
    {
        $app->get('/users/me', static function ($request, $response) use ($pdo) {
            return self::me($request, $response, Gate::db($pdo));
        });
        $app->patch('/users/me', static function ($request, $response) use ($pdo) {
            return self::patchMe($request, $response, Gate::db($pdo));
        });
        $app->patch('/user/profile', static function ($request, $response) use ($pdo) {
            return self::shownName($request, $response, Gate::db($pdo));
        });
        $app->get('/users/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::one($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->get('/admin/users', static function ($request, $response) use ($pdo) {
            return self::all($request, $response, Gate::db($pdo));
        });
        $app->post('/admin/users/{id}/ban', static function ($request, $response, array $args) use ($config, $pdo, $sessions) {
            return self::ban($request, $response, $config, Gate::db($pdo), $sessions, (string) ($args['id'] ?? ''), 'banned');
        });
        $app->post('/admin/users/{id}/timeout', static function ($request, $response, array $args) use ($config, $pdo, $sessions) {
            return self::ban($request, $response, $config, Gate::db($pdo), $sessions, (string) ($args['id'] ?? ''), 'timeout');
        });
        $app->post('/admin/users/{id}/unban', static function ($request, $response, array $args) use ($config, $pdo, $sessions) {
            return self::ban($request, $response, $config, Gate::db($pdo), $sessions, (string) ($args['id'] ?? ''), 'none');
        });
        $app->patch('/admin/users/{id}/role', static function ($request, $response, array $args) use ($pdo) {
            return self::role($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
    }

    private static function me(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        if ($actor->isGuest() || !is_string($actor->accountId)) {
            throw new HttpError(401, 'unauthorized');
        }
        $row = self::fetch($pdo, $actor->accountId);
        if (!Authz::permits('accounts', 'select', $actor, $row)) {
            throw new HttpError(403, 'forbidden');
        }
        return Reply::json($response, 200, ['user' => self::map($row)]);
    }

    private static function one(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $actor = Gate::actor($request);
        if ($actor->isGuest()) {
            throw new HttpError(401, 'unauthorized');
        }
        $id = Values::uuid($id, 'id', true);
        $row = Database::run($pdo, 'SELECT ' . self::COLUMNS . ' FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($row) || !Authz::permits('accounts', 'select', $actor, $row)) {
            throw new HttpError(404, 'not_found');
        }
        return Reply::json($response, 200, ['user' => self::map($row)]);
    }

    private static function all(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('accounts', 'select', $actor);
        if (!$actor->isAdmin()) {
            throw new HttpError(403, 'forbidden');
        }
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 100, 100);
        $params = [];
        $where = '';
        if ($cursor !== null) {
            $where = 'WHERE (created_at < ? OR (created_at = ? AND id < ?))';
            $params = [$cursor[0], $cursor[0], $cursor[1]];
        }
        $sql = 'SELECT ' . self::COLUMNS . ' FROM accounts ' . $where . ' ORDER BY created_at DESC, id DESC';
        if ($offset !== null) {
            $sql .= ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            $next = null;
        } else {
            $sql .= ' LIMIT ' . ($limit + 1);
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            [$rows, $next] = Page::next($rows, $limit);
        }
        $users = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $users[] = self::map($row);
            }
        }
        return Reply::json($response, 200, ['users' => $users, 'nextCursor' => $next]);
    }

    private static function patchMe(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        if ($actor->isGuest() || !is_string($actor->accountId)) {
            throw new HttpError(401, 'unauthorized');
        }
        $body = self::body($request, false);
        Values::only($body, ['displayName', 'photoURL', 'nickname', 'shownName', 'hasSeenTutorial']);
        if ($body === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        Gate::demand('accounts', 'update', $actor, ['id' => $actor->accountId]);
        $sets = [];
        $params = [];
        if (array_key_exists('displayName', $body)) {
            $sets[] = 'display_name = ?';
            $params[] = Values::text($body['displayName'], 'displayName', 255, true);
        }
        if (array_key_exists('photoURL', $body)) {
            $sets[] = 'photo_url = ?';
            $params[] = Values::httpsOrPath($body['photoURL'], 'photoURL', false);
        }
        if (array_key_exists('nickname', $body)) {
            $sets[] = 'nickname = ?';
            $params[] = Values::text($body['nickname'], 'nickname', 100, false);
        }
        if (array_key_exists('shownName', $body)) {
            $sets[] = 'shown_name = ?';
            $params[] = self::trimName($body['shownName']);
        }
        if (array_key_exists('hasSeenTutorial', $body)) {
            $sets[] = 'has_seen_tutorial = ?';
            $params[] = Values::bool($body['hasSeenTutorial'], 'hasSeenTutorial') ? 1 : 0;
        }
        $id = $actor->accountId;
        $params[] = $id;
        $sql = 'UPDATE accounts SET ' . implode(', ', $sets) . ' WHERE id = ?';
        Feed::write($pdo, 'accounts', static function (PDO $pdo) use ($sql, $params): void {
            Database::run($pdo, $sql, $params);
        });
        return Reply::json($response, 200, ['user' => self::map(self::fetch($pdo, $id))]);
    }

    private static function shownName(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        if ($actor->isGuest() || !is_string($actor->accountId)) {
            throw new HttpError(401, 'Unauthorized');
        }
        $body = self::body($request, true);
        Values::only($body, ['shownName']);
        Gate::demand('accounts', 'update', $actor, ['id' => $actor->accountId]);
        $shown = self::trimName($body['shownName'] ?? null);
        $id = $actor->accountId;
        Feed::write($pdo, 'accounts', static function (PDO $pdo) use ($shown, $id): void {
            Database::run($pdo, 'UPDATE accounts SET shown_name = ? WHERE id = ?', [$shown, $id]);
        });
        return Reply::json($response, 200, ['ok' => true, 'shownName' => $shown]);
    }

    private static function ban(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $config,
        PDO $pdo,
        SessionService $sessions,
        string $id,
        string $status,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        if ($actor->isGuest()) {
            throw new HttpError(401, 'unauthorized');
        }
        if (!$actor->isAdmin() || !$actor->active) {
            throw new HttpError(403, 'forbidden');
        }
        $id = Values::uuid($id, 'id', true);
        $exists = Database::run($pdo, 'SELECT id FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($exists)) {
            throw new HttpError(404, 'not_found');
        }
        $body = self::body($request, $status === 'none');
        if ($status === 'none') {
            Values::only($body, []);
        }
        $reason = null;
        $until = null;
        if ($status !== 'none') {
            $reason = Values::text($body['reason'] ?? null, 'reason', 500, true);
            Values::only($body, $status === 'timeout' ? ['reason', 'durationMinutes'] : ['reason']);
        }
        if ($status === 'timeout') {
            if (!isset($body['durationMinutes']) || !is_int($body['durationMinutes'])) {
                throw new HttpError(400, 'invalid_input', ['field' => 'durationMinutes']);
            }
            if ($body['durationMinutes'] < 1 || $body['durationMinutes'] > 10080) {
                throw new HttpError(400, 'invalid_input', ['field' => 'durationMinutes']);
            }
            $until = time() + ($body['durationMinutes'] * 60);
        }
        $self = is_string($actor->accountId) && hash_equals($actor->accountId, $id);
        $https = Https::requested($config, $request->getServerParams());
        $by = $actor->accountId;
        Feed::write($pdo, 'accounts', static function (PDO $pdo) use ($sessions, $id, $status, $reason, $by, $until, $https, $self): void {
            AccountWriter::setBan($pdo, $sessions, $id, $status, $reason, $by, $until, $https, time(), $self);
        });
        $payload = ['ok' => true];
        if ($status === 'timeout' && $until !== null) {
            $payload['timeoutUntil'] = gmdate('Y-m-d\TH:i:s', $until) . '.000Z';
        }
        return Reply::json($response, 200, $payload);
    }

    private static function role(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $actor = Gate::actor($request);
        if (!$actor->isAdmin() || !$actor->active) {
            throw new HttpError($actor->isGuest() ? 401 : 403, $actor->isGuest() ? 'unauthorized' : 'forbidden');
        }
        $id = Values::uuid($id, 'id', true);
        $body = self::body($request, false);
        Values::only($body, ['role']);
        $role = Values::text($body['role'] ?? null, 'role', 16, true);
        if ($role !== 'user' && $role !== 'admin') {
            throw new HttpError(400, 'invalid_input', ['field' => 'role']);
        }
        if (is_string($actor->accountId) && hash_equals($actor->accountId, $id) && $role !== 'admin') {
            throw new HttpError(400, 'invalid_input', ['field' => 'role']);
        }
        $exists = Database::run($pdo, 'SELECT id FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($exists)) {
            throw new HttpError(404, 'not_found');
        }
        Feed::write($pdo, 'accounts', static function (PDO $pdo) use ($id, $role): void {
            AccountWriter::setRole($pdo, $id, $role);
        });
        return Reply::json($response, 200, ['ok' => true, 'role' => $role]);
    }

    private static function fetch(PDO $pdo, string $id): array
    {
        $row = Database::run($pdo, 'SELECT ' . self::COLUMNS . ' FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    public static function map(array $row): array
    {
        $role = (string) ($row['role'] ?? 'user');
        $student = $row['student_id'] !== null && $row['student_id'] !== '' ? (string) $row['student_id'] : null;
        $verified = Values::flag($row['is_student_verified'] ?? 0) || $role === 'admin' || $student !== null;
        $methods = Values::jsonList($row['auth_methods'] ?? null);
        return [
            'uid' => (string) $row['id'],
            'email' => (string) ($row['email'] ?? ''),
            'displayName' => (string) ($row['display_name'] ?? ''),
            'photoURL' => self::photo(is_string($row['photo_url'] ?? null) ? $row['photo_url'] : null),
            'role' => $role === 'admin' ? 'admin' : 'user',
            'studentId' => $student,
            'firstName' => $row['first_name'] !== null ? (string) $row['first_name'] : null,
            'lastName' => $row['last_name'] !== null ? (string) $row['last_name'] : null,
            'nickname' => $row['nickname'] !== null ? (string) $row['nickname'] : null,
            'shownName' => $row['shown_name'] !== null ? (string) $row['shown_name'] : null,
            'isStudentVerified' => $verified,
            'authMethods' => array_is_list($methods) ? $methods : [],
            'mustChangePassword' => Values::flag($row['must_change_password'] ?? 0),
            'hasSeenTutorial' => Values::flag($row['has_seen_tutorial'] ?? 0),
            'banStatus' => (string) ($row['ban_status'] ?? 'none'),
            'banReason' => $row['ban_reason'] !== null ? (string) $row['ban_reason'] : null,
            'bannedAt' => Time::iso($row['banned_at'] ?? null),
            'bannedBy' => $row['banned_by'] !== null ? (string) $row['banned_by'] : null,
            'timeoutUntil' => Time::iso($row['timeout_until'] ?? null),
            'createdAt' => Time::iso($row['created_at']),
            'updatedAt' => Time::iso($row['updated_at']),
        ];
    }

    private static function photo(?string $url): ?string
    {
        if ($url === null || trim($url) === '') {
            return null;
        }
        $host = parse_url($url, PHP_URL_HOST);
        if (is_string($host)) {
            $host = strtolower($host);
            if ($host === 'lh3.googleusercontent.com' || str_ends_with($host, '.googleusercontent.com')) {
                return null;
            }
        }
        return $url;
    }

    private static function trimName(mixed $value): ?string
    {
        $text = Values::text($value, 'shownName', 40, false);
        if ($text === null) {
            return null;
        }
        $text = trim($text);
        return $text === '' ? null : $text;
    }

    private static function body(ServerRequestInterface $request, bool $allowEmpty): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if ($body === null && $allowEmpty) {
            return [];
        }
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }
}
