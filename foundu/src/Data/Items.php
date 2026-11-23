<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\Actor;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Ids;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// Lost and found reports. A student may insert their own row in the status
// the matrix allows. Updates and deletes are admin. Linking two items is
// the match route in a later phase, so matched_* is not writable here.
final class Items
{
    private const LOST = 'id, tracking_code, item_name, category, description, location_lost, location_place_name, location_coords, date_lost, contacts, user_id, student_id, status, matched_found_id, created_at, updated_at';
    private const FOUND = 'id, tracking_code, photo_url, item_name, category, color, brand, description, location_found, location_place_name, location_coords, date_found, drop_off_location, finder_contacts, user_id, status, room_handover_confirmed, room_handover_confirmed_at, room_handover_confirmed_by, room_handover_confirmed_by_name, handover_deadline_at, expired_at, matched_lost_id, created_at, updated_at';

    public static function register(App $app, \Closure $pdo, Limiter $limiter): void
    {
        $app->get('/lost-items', static function ($request, $response) use ($pdo) {
            return self::listLost($request, $response, Gate::db($pdo));
        });
        $app->get('/lost-items/latest', static function ($request, $response) use ($pdo) {
            return self::latest($request, $response, Gate::db($pdo), 'lost');
        });
        $app->get('/lost-items/by-code/{code}', static function ($request, $response, array $args) use ($pdo) {
            return self::byCode($request, $response, Gate::db($pdo), 'lost', (string) ($args['code'] ?? ''));
        });
        $app->get('/lost-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::one($request, $response, Gate::db($pdo), 'lost', (string) ($args['id'] ?? ''));
        });
        $app->post('/lost-items', static function ($request, $response) use ($pdo, $limiter) {
            return self::createLost($request, $response, Gate::db($pdo), $limiter);
        });
        $app->patch('/lost-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::patchLost($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->delete('/lost-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::remove($request, $response, Gate::db($pdo), 'lost_items', (string) ($args['id'] ?? ''));
        });

        $app->get('/found-items', static function ($request, $response) use ($pdo) {
            return self::listFound($request, $response, Gate::db($pdo));
        });
        $app->get('/found-items/latest', static function ($request, $response) use ($pdo) {
            return self::latest($request, $response, Gate::db($pdo), 'found');
        });
        $app->get('/found-items/by-code/{code}', static function ($request, $response, array $args) use ($pdo) {
            return self::byCode($request, $response, Gate::db($pdo), 'found', (string) ($args['code'] ?? ''));
        });
        $app->get('/found-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::one($request, $response, Gate::db($pdo), 'found', (string) ($args['id'] ?? ''));
        });
        $app->post('/found-items', static function ($request, $response) use ($pdo, $limiter) {
            return self::createFound($request, $response, Gate::db($pdo), $limiter);
        });
        $app->patch('/found-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::patchFound($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->delete('/found-items/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::remove($request, $response, Gate::db($pdo), 'found_items', (string) ($args['id'] ?? ''));
        });
        $app->post('/found-items/{id}/handover', static function ($request, $response, array $args) use ($pdo) {
            return self::handover($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });

        $app->get('/stats', static function ($request, $response) use ($pdo) {
            Gate::demand('lost_items', 'select', Gate::actor($request));
            return Reply::public($request, $response, self::stats(Gate::db($pdo)));
        });
    }

    private static function listLost(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('lost_items', 'select', $actor);
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 50, 100);
        $where = [];
        $params = [];
        self::filter($request->getQueryParams(), $where, $params, true);
        $rows = self::select($pdo, 'lost_items', self::LOST, $where, $params, $limit, $offset, $cursor);
        if ($offset !== null) {
            $page = $rows;
            $next = null;
        } else {
            [$page, $next] = Page::next($rows, $limit);
        }
        $items = [];
        foreach ($page as $row) {
            $items[] = self::lost($row);
        }
        return Reply::json($response, 200, ['items' => $items, 'nextCursor' => $next]);
    }

    private static function listFound(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('found_items', 'select', Gate::actor($request));
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 50, 100);
        $where = [];
        $params = [];
        self::filter($request->getQueryParams(), $where, $params, false);
        $rows = self::select($pdo, 'found_items', self::FOUND, $where, $params, $limit, $offset, $cursor);
        if ($offset !== null) {
            $page = $rows;
            $next = null;
        } else {
            [$page, $next] = Page::next($rows, $limit);
        }
        $items = [];
        foreach ($page as $row) {
            $items[] = self::found($row);
        }
        return Reply::json($response, 200, ['items' => $items, 'nextCursor' => $next]);
    }

    private static function latest(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $kind): ResponseInterface
    {
        $table = $kind === 'found' ? 'found_items' : 'lost_items';
        Gate::demand($table, 'select', Gate::actor($request));
        $limit = Page::read(['limit' => $request->getQueryParams()['limit'] ?? null], 5, 20)[0];
        if ($kind === 'found') {
            $rows = Database::run(
                $pdo,
                'SELECT ' . self::FOUND . ' FROM found_items WHERE status IN (\'found\', \'claimed\') ORDER BY created_at DESC, id DESC LIMIT ' . $limit
            )->fetchAll();
            $items = array_map([self::class, 'found'], $rows);
        } else {
            $rows = Database::run(
                $pdo,
                'SELECT ' . self::LOST . ' FROM lost_items WHERE status = \'searching\' ORDER BY created_at DESC, id DESC LIMIT ' . $limit
            )->fetchAll();
            $items = array_map([self::class, 'lost'], $rows);
        }
        return Reply::json($response, 200, ['items' => $items]);
    }

    private static function byCode(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $kind, string $code): ResponseInterface
    {
        $prefix = $kind === 'found' ? 'FOUND' : 'LOST';
        $table = $kind === 'found' ? 'found_items' : 'lost_items';
        Gate::demand($table, 'select', Gate::actor($request));
        $code = Values::tracking($code, $prefix);
        if ($kind === 'found') {
            $row = Database::run($pdo, 'SELECT ' . self::FOUND . ' FROM found_items WHERE tracking_code = ? ORDER BY created_at DESC LIMIT 1', [$code])->fetch();
            $item = is_array($row) ? self::found($row) : null;
        } else {
            $row = Database::run($pdo, 'SELECT ' . self::LOST . ' FROM lost_items WHERE tracking_code = ? ORDER BY created_at DESC LIMIT 1', [$code])->fetch();
            $item = is_array($row) ? self::lost($row) : null;
        }
        if ($item === null) {
            throw new HttpError(404, 'not_found');
        }
        return Reply::json($response, 200, ['item' => $item]);
    }

    private static function one(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $kind, string $id): ResponseInterface
    {
        Gate::demand($kind === 'found' ? 'found_items' : 'lost_items', 'select', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        if ($kind === 'found') {
            $row = Database::run($pdo, 'SELECT ' . self::FOUND . ' FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
            $item = is_array($row) ? self::found($row) : null;
        } else {
            $row = Database::run($pdo, 'SELECT ' . self::LOST . ' FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
            $item = is_array($row) ? self::lost($row) : null;
        }
        if ($item === null) {
            throw new HttpError(404, 'not_found');
        }
        return Reply::json($response, 200, ['item' => $item]);
    }

    private static function createLost(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, Limiter $limiter): ResponseInterface
    {
        $actor = Gate::actor($request);
        $body = self::body($request);
        Values::only($body, [
            'trackingCode', 'itemName', 'category', 'description', 'locationLost', 'locationPlaceName',
            'locationCoords', 'dateLost', 'contacts', 'userId', 'studentId', 'status',
        ]);
        $userId = self::owner($actor, $body);
        Gate::demand('lost_items', 'insert', $actor, ['user_id' => $userId]);
        $status = array_key_exists('status', $body) ? Values::status($body['status'], 'status') : 'searching';
        if (!$actor->isAdmin() && $status !== 'searching') {
            throw new HttpError(403, 'forbidden');
        }
        self::pace($pdo, $limiter, $actor);
        $studentId = self::student($pdo, $actor, $body);
        $id = Ids::uuid();
        $code = array_key_exists('trackingCode', $body)
            ? Values::tracking($body['trackingCode'], 'LOST')
            : self::code($pdo, 'lost_items', 'LOST');
        $date = array_key_exists('dateLost', $body) ? Time::sql($body['dateLost'], 'dateLost') : null;
        Feed::write($pdo, 'lost_items', static function (PDO $pdo) use ($id, $code, $body, $userId, $studentId, $status, $date): void {
            Database::run(
                $pdo,
                'INSERT INTO lost_items (
                    id, tracking_code, item_name, category, description, location_lost, location_place_name,
                    location_coords, date_lost, contacts, user_id, student_id, status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)), ?, ?, ?, ?)',
                [
                    $id,
                    $code,
                    Values::text($body['itemName'] ?? null, 'itemName', 255, true),
                    Values::text($body['category'] ?? null, 'category', 64, true),
                    Values::text($body['description'] ?? null, 'description', 8000, false),
                    Values::text($body['locationLost'] ?? null, 'locationLost', 255, true),
                    Values::text($body['locationPlaceName'] ?? null, 'locationPlaceName', 255, false),
                    array_key_exists('locationCoords', $body) ? Values::coords($body['locationCoords'], 'locationCoords') : null,
                    $date,
                    Values::contacts($body['contacts'] ?? [], 'contacts', false),
                    $userId,
                    $studentId,
                    $status,
                ]
            );
        });
        return Reply::json($response, 201, ['id' => $id, 'item' => self::mustLost($pdo, $id)]);
    }

    private static function createFound(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, Limiter $limiter): ResponseInterface
    {
        $actor = Gate::actor($request);
        $body = self::body($request);
        Values::only($body, [
            'trackingCode', 'photoUrl', 'itemName', 'category', 'color', 'brand', 'description',
            'locationFound', 'locationPlaceName', 'locationCoords', 'dateFound', 'dropOffLocation',
            'finderContacts', 'userId', 'status',
        ]);
        $userId = self::owner($actor, $body);
        Gate::demand('found_items', 'insert', $actor, ['user_id' => $userId]);
        $status = array_key_exists('status', $body) ? Values::status($body['status'], 'status') : 'pending_room_confirm';
        if (!$actor->isAdmin() && $status !== 'pending_room_confirm') {
            throw new HttpError(403, 'forbidden');
        }
        self::pace($pdo, $limiter, $actor);
        $id = Ids::uuid();
        $code = array_key_exists('trackingCode', $body)
            ? Values::tracking($body['trackingCode'], 'FOUND')
            : self::code($pdo, 'found_items', 'FOUND');
        $date = array_key_exists('dateFound', $body) ? Time::sql($body['dateFound'], 'dateFound') : null;
        $minutes = Settings::handoverMinutes($pdo);
        Feed::write($pdo, 'found_items', static function (PDO $pdo) use ($id, $code, $body, $userId, $status, $date, $minutes): void {
            $deadlineSql = $minutes === null
                ? 'NULL'
                : 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ' . $minutes . ' MINUTE)';
            Database::run(
                $pdo,
                'INSERT INTO found_items (
                    id, tracking_code, photo_url, item_name, category, color, brand, description,
                    location_found, location_place_name, location_coords, date_found, drop_off_location,
                    finder_contacts, user_id, status, handover_deadline_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)), ?, ?, ?, ?, ' . $deadlineSql . ')',
                [
                    $id,
                    $code,
                    Values::httpsOrPath($body['photoUrl'] ?? null, 'photoUrl', false),
                    Values::text($body['itemName'] ?? null, 'itemName', 255, false),
                    Values::text($body['category'] ?? null, 'category', 64, false),
                    Values::text($body['color'] ?? null, 'color', 64, false),
                    Values::text($body['brand'] ?? null, 'brand', 64, false),
                    Values::text($body['description'] ?? null, 'description', 8000, true),
                    Values::text($body['locationFound'] ?? null, 'locationFound', 255, true),
                    Values::text($body['locationPlaceName'] ?? null, 'locationPlaceName', 255, false),
                    array_key_exists('locationCoords', $body) ? Values::coords($body['locationCoords'], 'locationCoords') : null,
                    $date,
                    Values::text($body['dropOffLocation'] ?? null, 'dropOffLocation', 64, false) ?? 'personnel_office',
                    array_key_exists('finderContacts', $body) ? Values::contacts($body['finderContacts'], 'finderContacts', false) : null,
                    $userId,
                    $status,
                ]
            );
        });
        return Reply::json($response, 201, ['id' => $id, 'item' => self::mustFound($pdo, $id)]);
    }

    private static function patchLost(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('lost_items', 'update', $actor);
        $id = Values::uuid($id, 'id', true);
        $body = self::body($request);
        $map = [
            'trackingCode' => 'tracking_code',
            'itemName' => 'item_name',
            'category' => 'category',
            'description' => 'description',
            'locationLost' => 'location_lost',
            'locationPlaceName' => 'location_place_name',
            'locationCoords' => 'location_coords',
            'dateLost' => 'date_lost',
            'contacts' => 'contacts',
            'userId' => 'user_id',
            'studentId' => 'student_id',
            'status' => 'status',
        ];
        Values::only($body, array_keys($map));
        if ($body === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        $sets = [];
        $params = [];
        foreach ($map as $key => $column) {
            if (!array_key_exists($key, $body)) {
                continue;
            }
            $sets[] = $column . ' = ?';
            $params[] = self::lostValue($pdo, $key, $body[$key]);
        }
        $params[] = $id;
        $sql = 'UPDATE lost_items SET ' . implode(', ', $sets) . ' WHERE id = ?';
        Feed::write($pdo, 'lost_items', static function (PDO $pdo) use ($sql, $params, $id): void {
            $changed = Database::run($pdo, $sql, $params)->rowCount();
            if ($changed > 0) {
                return;
            }
            $exists = Database::run($pdo, 'SELECT id FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
            if (!is_array($exists)) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, ['item' => self::mustLost($pdo, $id)]);
    }

    private static function patchFound(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        Gate::demand('found_items', 'update', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        $body = self::body($request);
        $map = [
            'trackingCode' => 'tracking_code',
            'photoUrl' => 'photo_url',
            'itemName' => 'item_name',
            'category' => 'category',
            'color' => 'color',
            'brand' => 'brand',
            'description' => 'description',
            'locationFound' => 'location_found',
            'locationPlaceName' => 'location_place_name',
            'locationCoords' => 'location_coords',
            'dateFound' => 'date_found',
            'dropOffLocation' => 'drop_off_location',
            'finderContacts' => 'finder_contacts',
            'userId' => 'user_id',
            'status' => 'status',
            'roomHandoverConfirmed' => 'room_handover_confirmed',
            'roomHandoverConfirmedAt' => 'room_handover_confirmed_at',
            'roomHandoverConfirmedBy' => 'room_handover_confirmed_by',
            'roomHandoverConfirmedByName' => 'room_handover_confirmed_by_name',
            'handoverDeadlineAt' => 'handover_deadline_at',
            'expiredAt' => 'expired_at',
        ];
        Values::only($body, array_keys($map));
        if ($body === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        $sets = [];
        $params = [];
        foreach ($map as $key => $column) {
            if (!array_key_exists($key, $body)) {
                continue;
            }
            $sets[] = $column . ' = ?';
            $params[] = self::foundValue($pdo, $key, $body[$key]);
        }
        $params[] = $id;
        $sql = 'UPDATE found_items SET ' . implode(', ', $sets) . ' WHERE id = ?';
        Feed::write($pdo, 'found_items', static function (PDO $pdo) use ($sql, $params, $id): void {
            $changed = Database::run($pdo, $sql, $params)->rowCount();
            if ($changed > 0) {
                return;
            }
            $exists = Database::run($pdo, 'SELECT id FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
            if (!is_array($exists)) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, ['item' => self::mustFound($pdo, $id)]);
    }

    private static function handover(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('found_items', 'update', $actor);
        $id = Values::uuid($id, 'id', true);
        $name = self::displayName($pdo, (string) $actor->accountId);
        Feed::write($pdo, 'found_items', static function (PDO $pdo) use ($id, $actor, $name): void {
            $changed = Database::run(
                $pdo,
                'UPDATE found_items SET
                    status = \'found\',
                    room_handover_confirmed = 1,
                    room_handover_confirmed_at = UTC_TIMESTAMP(3),
                    room_handover_confirmed_by = ?,
                    room_handover_confirmed_by_name = ?
                 WHERE id = ? AND status = \'pending_room_confirm\'',
                [$actor->accountId, $name, $id]
            )->rowCount();
            if ($changed > 0) {
                return;
            }
            $exists = Database::run($pdo, 'SELECT id FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
            throw new HttpError(is_array($exists) ? 409 : 404, is_array($exists) ? 'conflict' : 'not_found');
        });
        return Reply::json($response, 200, ['item' => self::mustFound($pdo, $id)]);
    }

    private static function remove(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $table, string $id): ResponseInterface
    {
        Gate::demand($table, 'delete', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        $sql = $table === 'found_items'
            ? 'DELETE FROM found_items WHERE id = ?'
            : 'DELETE FROM lost_items WHERE id = ?';
        Feed::write($pdo, $table, static function (PDO $pdo) use ($sql, $id): void {
            $changed = Database::run($pdo, $sql, [$id])->rowCount();
            if ($changed < 1) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    public static function stats(PDO $pdo): array
    {
        $rows = Database::run(
            $pdo,
            'SELECT \'lost\' AS kind, status, COUNT(*) AS n FROM lost_items GROUP BY status
             UNION ALL
             SELECT \'found\', status, COUNT(*) FROM found_items GROUP BY status'
        )->fetchAll();
        $out = ['searching' => 0, 'found' => 0, 'claimed' => 0, 'pendingRoomConfirm' => 0];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $n = (int) $row['n'];
            $status = (string) $row['status'];
            $kind = (string) $row['kind'];
            if ($kind === 'lost' && $status === 'searching') {
                $out['searching'] += $n;
            } elseif ($kind === 'found' && $status === 'pending_room_confirm') {
                $out['pendingRoomConfirm'] += $n;
            } elseif ($status === 'found') {
                $out['found'] += $n;
            } elseif ($status === 'claimed') {
                $out['claimed'] += $n;
            }
        }
        return $out;
    }

    private static function filter(array $query, array &$where, array &$params, bool $lost): void
    {
        if (isset($query['status']) && $query['status'] !== '') {
            $where[] = 'status = ?';
            $params[] = Values::status($query['status'], 'status');
        }
        if (isset($query['category']) && $query['category'] !== '') {
            $where[] = 'category = ?';
            $params[] = Values::text($query['category'], 'category', 64, true);
        }
        if (isset($query['userId']) && $query['userId'] !== '') {
            $where[] = 'user_id = ?';
            $params[] = Values::uuid($query['userId'], 'userId', true);
        }
        if ($lost && isset($query['studentId']) && $query['studentId'] !== '') {
            $student = Values::text($query['studentId'], 'studentId', 5, true);
            if (preg_match('/^\d{5}$/', $student) !== 1) {
                throw new HttpError(400, 'invalid_input', ['field' => 'studentId']);
            }
            $where[] = 'student_id = ?';
            $params[] = $student;
        }
        if (isset($query['trackingCode']) && $query['trackingCode'] !== '') {
            $where[] = 'tracking_code = ?';
            $params[] = Values::tracking($query['trackingCode'], $lost ? 'LOST' : 'FOUND');
        }
    }

    private static function select(PDO $pdo, string $table, string $columns, array $where, array $params, int $limit, ?int $offset, ?array $cursor): array
    {
        $sqlWhere = $where;
        if ($cursor !== null) {
            $sqlWhere[] = '(created_at < ? OR (created_at = ? AND id < ?))';
            $params[] = $cursor[0];
            $params[] = $cursor[0];
            $params[] = $cursor[1];
        }
        $sql = 'SELECT ' . $columns . ' FROM ' . $table;
        if ($sqlWhere !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $sqlWhere);
        }
        $sql .= ' ORDER BY created_at DESC, id DESC';
        if ($offset !== null) {
            $sql .= ' LIMIT ' . $limit . ' OFFSET ' . $offset;
        } else {
            $sql .= ' LIMIT ' . ($limit + 1);
        }
        return Database::run($pdo, $sql, $params)->fetchAll();
    }

    private static function owner(Actor $actor, array $body): string
    {
        if ($actor->isGuest() || !is_string($actor->accountId)) {
            throw new HttpError(401, 'unauthorized');
        }
        if (!$actor->isAdmin()) {
            if (isset($body['userId']) && $body['userId'] !== $actor->accountId) {
                throw new HttpError(403, 'forbidden');
            }
            return $actor->accountId;
        }
        if (!array_key_exists('userId', $body) || $body['userId'] === null || $body['userId'] === '') {
            return $actor->accountId;
        }
        return Values::uuid($body['userId'], 'userId', true);
    }

    private static function student(PDO $pdo, Actor $actor, array $body): ?string
    {
        if (!$actor->isAdmin()) {
            if (isset($body['studentId']) && $body['studentId'] !== '' && $body['studentId'] !== $actor->studentId) {
                throw new HttpError(403, 'forbidden');
            }
            return $actor->studentId;
        }
        if (!array_key_exists('studentId', $body) || $body['studentId'] === null || $body['studentId'] === '') {
            return null;
        }
        $student = Values::text($body['studentId'], 'studentId', 5, true);
        if (preg_match('/^\d{5}$/', $student) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'studentId']);
        }
        $row = Database::run($pdo, 'SELECT student_id FROM accounts WHERE student_id = ? LIMIT 1', [$student])->fetch();
        if (!is_array($row)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'studentId']);
        }
        return $student;
    }

    private static function pace(PDO $pdo, Limiter $limiter, Actor $actor): void
    {
        $cap = $actor->isAdmin() ? 200 : 30;
        $decision = $limiter->hit($pdo, 'account_item_create', (string) $actor->accountId, $cap, 3600, time());
        if (!$decision->allowed) {
            throw HttpError::tooMany($decision->retryAfter);
        }
    }

    private static function code(PDO $pdo, string $table, string $prefix): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $sql = $table === 'found_items'
            ? 'SELECT id FROM found_items WHERE tracking_code = ? LIMIT 1'
            : 'SELECT id FROM lost_items WHERE tracking_code = ? LIMIT 1';
        for ($try = 0; $try < 5; $try++) {
            $code = $prefix . '-';
            for ($i = 0; $i < 6; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $hit = Database::run($pdo, $sql, [$code])->fetch();
            if (!is_array($hit)) {
                return $code;
            }
        }
        throw new HttpError(500, 'server_error');
    }

    private static function lostValue(PDO $pdo, string $key, mixed $value): mixed
    {
        return match ($key) {
            'trackingCode' => Values::tracking($value, 'LOST'),
            'itemName' => Values::text($value, 'itemName', 255, true),
            'category' => Values::text($value, 'category', 64, true),
            'description' => Values::text($value, 'description', 8000, false),
            'locationLost' => Values::text($value, 'locationLost', 255, true),
            'locationPlaceName' => Values::text($value, 'locationPlaceName', 255, false),
            'locationCoords' => Values::coords($value, 'locationCoords'),
            'dateLost' => Time::sql($value, 'dateLost'),
            'contacts' => Values::contacts($value, 'contacts', false),
            'status' => Values::status($value, 'status'),
            'userId' => self::existingUser($pdo, $value),
            'studentId' => self::existingStudent($pdo, $value),
            default => throw new HttpError(400, 'invalid_input', ['field' => $key]),
        };
    }

    private static function foundValue(PDO $pdo, string $key, mixed $value): mixed
    {
        return match ($key) {
            'trackingCode' => Values::tracking($value, 'FOUND'),
            'photoUrl' => Values::httpsOrPath($value, 'photoUrl', false),
            'itemName' => Values::text($value, 'itemName', 255, false),
            'category' => Values::text($value, 'category', 64, false),
            'color' => Values::text($value, 'color', 64, false),
            'brand' => Values::text($value, 'brand', 64, false),
            'description' => Values::text($value, 'description', 8000, true),
            'locationFound' => Values::text($value, 'locationFound', 255, true),
            'locationPlaceName' => Values::text($value, 'locationPlaceName', 255, false),
            'locationCoords' => Values::coords($value, 'locationCoords'),
            'dateFound' => Time::sql($value, 'dateFound'),
            'dropOffLocation' => Values::text($value, 'dropOffLocation', 64, true),
            'finderContacts' => Values::contacts($value, 'finderContacts', false),
            'userId' => self::existingUser($pdo, $value),
            'status' => Values::status($value, 'status'),
            'roomHandoverConfirmed' => Values::bool($value, 'roomHandoverConfirmed') ? 1 : 0,
            'roomHandoverConfirmedAt' => $value === null ? null : Time::sql($value, 'roomHandoverConfirmedAt'),
            'roomHandoverConfirmedBy' => $value === null ? null : self::existingUser($pdo, $value),
            'roomHandoverConfirmedByName' => Values::text($value, 'roomHandoverConfirmedByName', 255, false),
            'handoverDeadlineAt' => $value === null ? null : Time::sql($value, 'handoverDeadlineAt'),
            'expiredAt' => $value === null ? null : Time::sql($value, 'expiredAt'),
            default => throw new HttpError(400, 'invalid_input', ['field' => $key]),
        };
    }

    private static function existingUser(PDO $pdo, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $id = Values::uuid($value, 'userId', true);
        $row = Database::run($pdo, 'SELECT id FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($row)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'userId']);
        }
        return $id;
    }

    private static function existingStudent(PDO $pdo, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $student = Values::text($value, 'studentId', 5, true);
        if (preg_match('/^\d{5}$/', $student) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'studentId']);
        }
        $row = Database::run($pdo, 'SELECT student_id FROM accounts WHERE student_id = ? LIMIT 1', [$student])->fetch();
        if (!is_array($row)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'studentId']);
        }
        return $student;
    }

    private static function displayName(PDO $pdo, string $id): string
    {
        $row = Database::run($pdo, 'SELECT display_name, email FROM accounts WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($row)) {
            return $id;
        }
        $name = trim((string) ($row['display_name'] ?? ''));
        if ($name !== '') {
            return $name;
        }
        $email = trim((string) ($row['email'] ?? ''));
        return $email !== '' ? $email : $id;
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }

    private static function mustLost(PDO $pdo, string $id): array
    {
        $row = Database::run($pdo, 'SELECT ' . self::LOST . ' FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
        return is_array($row) ? self::lost($row) : [];
    }

    private static function mustFound(PDO $pdo, string $id): array
    {
        $row = Database::run($pdo, 'SELECT ' . self::FOUND . ' FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
        return is_array($row) ? self::found($row) : [];
    }

    public static function lost(array $row): array
    {
        $coords = Values::jsonObject($row['location_coords'] ?? null);
        return [
            'id' => (string) $row['id'],
            'trackingCode' => (string) $row['tracking_code'],
            'itemName' => (string) $row['item_name'],
            'category' => (string) $row['category'],
            'description' => $row['description'] !== null ? (string) $row['description'] : null,
            'locationLost' => (string) $row['location_lost'],
            'locationPlaceName' => $row['location_place_name'] !== null ? (string) $row['location_place_name'] : null,
            'locationCoords' => $coords,
            'dateLost' => Time::iso($row['date_lost']),
            'contacts' => array_is_list(Values::jsonList($row['contacts'] ?? null)) ? Values::jsonList($row['contacts'] ?? null) : [],
            'userId' => $row['user_id'] !== null ? (string) $row['user_id'] : null,
            'studentId' => $row['student_id'] !== null ? (string) $row['student_id'] : null,
            'status' => (string) $row['status'],
            'matchedFoundId' => $row['matched_found_id'] !== null ? (string) $row['matched_found_id'] : null,
            'createdAt' => Time::iso($row['created_at']),
            'updatedAt' => Time::iso($row['updated_at']),
        ];
    }

    public static function found(array $row): array
    {
        $contacts = Values::jsonList($row['finder_contacts'] ?? null);
        return [
            'id' => (string) $row['id'],
            'trackingCode' => (string) $row['tracking_code'],
            'photoUrl' => $row['photo_url'] !== null ? (string) $row['photo_url'] : null,
            'itemName' => $row['item_name'] !== null ? (string) $row['item_name'] : null,
            'category' => $row['category'] !== null ? (string) $row['category'] : null,
            'color' => $row['color'] !== null ? (string) $row['color'] : null,
            'brand' => $row['brand'] !== null ? (string) $row['brand'] : null,
            'description' => (string) $row['description'],
            'locationFound' => (string) $row['location_found'],
            'locationPlaceName' => $row['location_place_name'] !== null ? (string) $row['location_place_name'] : null,
            'locationCoords' => Values::jsonObject($row['location_coords'] ?? null),
            'dateFound' => Time::iso($row['date_found']),
            'dropOffLocation' => (string) $row['drop_off_location'],
            'finderContacts' => array_is_list($contacts) ? $contacts : [],
            'userId' => $row['user_id'] !== null ? (string) $row['user_id'] : null,
            'status' => (string) $row['status'],
            'roomHandoverConfirmed' => Values::flag($row['room_handover_confirmed'] ?? 0),
            'roomHandoverConfirmedAt' => Time::iso($row['room_handover_confirmed_at'] ?? null),
            'roomHandoverConfirmedBy' => $row['room_handover_confirmed_by'] !== null ? (string) $row['room_handover_confirmed_by'] : null,
            'roomHandoverConfirmedByName' => $row['room_handover_confirmed_by_name'] !== null ? (string) $row['room_handover_confirmed_by_name'] : null,
            'handoverDeadlineAt' => Time::iso($row['handover_deadline_at'] ?? null),
            'expiredAt' => Time::iso($row['expired_at'] ?? null),
            'matchedLostId' => $row['matched_lost_id'] !== null ? (string) $row['matched_lost_id'] : null,
            'createdAt' => Time::iso($row['created_at']),
            'updatedAt' => Time::iso($row['updated_at']),
        ];
    }
}
