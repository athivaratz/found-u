<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\ClientAddress;
use Foundu\Http\HttpError;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Throwable;

final class Site
{
    public static function register(App $app, \Closure $pdo, string $appRoot, Limiter $limiter): void
    {
        $app->get('/changes', static function ($request, $response) use ($pdo) {
            return self::changes($request, $response, Gate::db($pdo));
        });
        $app->get('/settings', static function ($request, $response) use ($pdo) {
            return self::settings($request, $response, Gate::db($pdo));
        });
        $app->patch('/admin/settings', static function ($request, $response) use ($pdo) {
            return self::saveSettings($request, $response, Gate::db($pdo));
        });
        $app->get('/public-settings', static function ($request, $response) use ($pdo) {
            return self::publicSettings($request, $response, Gate::db($pdo));
        });
        $app->get('/public-images', static function ($request, $response) use ($appRoot) {
            return self::images($request, $response, $appRoot);
        });
        $app->post('/found/expire-overdue', static function ($request, $response) use ($pdo, $limiter) {
            return self::expire($request, $response, Gate::db($pdo), $limiter);
        });
        $app->post('/revalidate-og', static function ($request, $response) {
            return Reply::json($response, 200, ['revalidated' => true]);
        });
        $app->get('/match-dismissals', static function ($request, $response) use ($pdo) {
            return self::dismissals($request, $response, Gate::db($pdo));
        });
        $app->post('/match-dismissals', static function ($request, $response) use ($pdo) {
            return self::dismiss($request, $response, Gate::db($pdo));
        });
        $app->delete('/match-dismissals/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::forget($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
    }

    private static function changes(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $query = $request->getQueryParams();
        if (!isset($query['tables']) || $query['tables'] === '') {
            $names = Feed::NAMES;
        } elseif (!is_string($query['tables'])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tables']);
        } else {
            $names = array_map('trim', explode(',', $query['tables']));
        }
        $body = Feed::read($pdo, $names);
        return Reply::changes($request, $response, $body);
    }

    private static function settings(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('app_settings', 'select', Gate::actor($request));
        try {
            $settings = Settings::read($pdo);
        } catch (Throwable $e) {
            if ($e instanceof HttpError) {
                throw $e;
            }
            return Reply::json($response, 200, ['settings' => Settings::readFallback(), 'loadError' => true]);
        }
        return Reply::public($request, $response, ['settings' => $settings, 'loadError' => null]);
    }

    private static function saveSettings(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('app_settings', 'update', $actor);
        if (!is_string($actor->accountId)) {
            throw new HttpError(401, 'unauthorized');
        }
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        $settings = Settings::save($pdo, $actor->accountId, $body);
        return Reply::json($response, 200, ['settings' => $settings, 'loadError' => null]);
    }

    private static function publicSettings(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        try {
            $payload = Settings::publicFields($pdo);
        } catch (Throwable) {
            $payload = ['comingSoonEnabled' => false, 'comingSoonMessage' => 'พบกันเร็วๆนี้'];
        }
        return Reply::public($request, $response, $payload);
    }

    private static function images(ServerRequestInterface $request, ResponseInterface $response, string $appRoot): ResponseInterface
    {
        $folder = $request->getQueryParams()['folder'] ?? 'img';
        if ($folder !== 'img' && $folder !== 'img/mobile_responsive') {
            $folder = 'img';
        }
        $images = self::heroImages($appRoot, $folder);
        return Reply::public($request, $response, ['images' => $images]);
    }

    private static function expire(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, Limiter $limiter): ResponseInterface
    {
        $client = $request->getAttribute(Attrs::CLIENT);
        $ip = $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
        $decision = $limiter->hit($pdo, 'ip_expire', $ip, 10, 60, time());
        if (!$decision->allowed) {
            throw HttpError::tooMany($decision->retryAfter);
        }
        try {
            $count = self::expireRows($pdo);
        } catch (Throwable $e) {
            if ($e instanceof HttpError) {
                throw $e;
            }
            throw new HttpError(500, 'Failed to expire overdue items');
        }
        return Reply::json($response, 200, ['expired' => $count]);
    }

    public static function expireRows(PDO $pdo): int
    {
        $minutes = Settings::handoverMinutes($pdo);
        if ($minutes === null) {
            return 0;
        }
        $pdo->beginTransaction();
        try {
            $changed = Database::run(
                $pdo,
                'UPDATE found_items
                 SET status = \'expired\', expired_at = UTC_TIMESTAMP(3)
                 WHERE status = \'pending_room_confirm\'
                   AND (
                     (handover_deadline_at IS NOT NULL AND handover_deadline_at <= UTC_TIMESTAMP(3))
                     OR (handover_deadline_at IS NULL AND created_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ' . $minutes . ' MINUTE))
                   )'
            )->rowCount();
            if ($changed > 0) {
                Feed::bump($pdo, 'found_items');
            }
            $pdo->commit();
            return $changed;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    private static function dismissals(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('match_dismissals', 'select', Gate::actor($request));
        [$limit, $offset, $cursor] = Page::read($request->getQueryParams(), 50, 100);
        $where = [];
        $params = [];
        $query = $request->getQueryParams();
        if (isset($query['lostId']) && $query['lostId'] !== '') {
            $where[] = 'lost_id = ?';
            $params[] = Values::uuid($query['lostId'], 'lostId', true);
        }
        if (isset($query['foundId']) && $query['foundId'] !== '') {
            $where[] = 'found_id = ?';
            $params[] = Values::uuid($query['foundId'], 'foundId', true);
        }
        if ($cursor !== null) {
            $where[] = '(created_at < ? OR (created_at = ? AND id < ?))';
            $params[] = $cursor[0];
            $params[] = $cursor[0];
            $params[] = $cursor[1];
        }
        $sql = 'SELECT id, lost_id, found_id, dismissed_by, created_at FROM match_dismissals';
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
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::dismissal($row);
            }
        }
        return Reply::json($response, 200, ['dismissals' => $items, 'nextCursor' => $next]);
    }

    private static function dismiss(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Gate::demand('match_dismissals', 'insert', $actor);
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || (array_is_list($body) && $body !== [])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        Values::only($body, ['lostId', 'foundId']);
        $lostId = Values::uuid($body['lostId'] ?? null, 'lostId', true);
        $foundId = Values::uuid($body['foundId'] ?? null, 'foundId', true);
        $lost = Database::run($pdo, 'SELECT id FROM lost_items WHERE id = ? LIMIT 1', [$lostId])->fetch();
        $found = Database::run($pdo, 'SELECT id FROM found_items WHERE id = ? LIMIT 1', [$foundId])->fetch();
        if (!is_array($lost) || !is_array($found)) {
            throw new HttpError(404, 'not_found');
        }
        $existing = Database::run(
            $pdo,
            'SELECT id, lost_id, found_id, dismissed_by, created_at FROM match_dismissals WHERE lost_id = ? AND found_id = ? LIMIT 1',
            [$lostId, $foundId]
        )->fetch();
        if (is_array($existing)) {
            return Reply::json($response, 200, ['dismissal' => self::dismissal($existing)]);
        }
        $id = \Foundu\Ids::uuid();
        $by = $actor->accountId;
        Feed::write($pdo, 'match_dismissals', static function (PDO $pdo) use ($id, $lostId, $foundId, $by): void {
            Database::run(
                $pdo,
                'INSERT INTO match_dismissals (id, lost_id, found_id, dismissed_by) VALUES (?, ?, ?, ?)',
                [$id, $lostId, $foundId, $by]
            );
        });
        $row = Database::run(
            $pdo,
            'SELECT id, lost_id, found_id, dismissed_by, created_at FROM match_dismissals WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        return Reply::json($response, 201, ['id' => $id, 'dismissal' => self::dismissal(is_array($row) ? $row : [])]);
    }

    private static function forget(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        Gate::demand('match_dismissals', 'delete', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        Feed::write($pdo, 'match_dismissals', static function (PDO $pdo) use ($id): void {
            $changed = Database::run($pdo, 'DELETE FROM match_dismissals WHERE id = ?', [$id])->rowCount();
            if ($changed < 1) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    private static function dismissal(array $row): array
    {
        return [
            'id' => (string) ($row['id'] ?? ''),
            'lostId' => (string) ($row['lost_id'] ?? ''),
            'foundId' => (string) ($row['found_id'] ?? ''),
            'dismissedBy' => isset($row['dismissed_by']) && $row['dismissed_by'] !== null ? (string) $row['dismissed_by'] : null,
            'createdAt' => Time::iso($row['created_at'] ?? null),
        ];
    }

    private static function heroImages(string $appRoot, string $folder): array
    {
        $public = dirname($appRoot) . '/public';
        $root = realpath($public);
        $dir = realpath($public . '/' . $folder);
        if ($root === false || $dir === false || !str_starts_with($dir, $root . DIRECTORY_SEPARATOR)) {
            return [];
        }
        $names = scandir($dir);
        if ($names === false) {
            return [];
        }
        $allowed = ['png' => true, 'jpg' => true, 'jpeg' => true, 'webp' => true, 'gif' => true, 'svg' => true];
        $files = [];
        foreach ($names as $name) {
            if ($name === '.' || $name === '..' || str_contains($name, '/') || str_contains($name, '\\')) {
                continue;
            }
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!isset($allowed[$ext])) {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $name;
            $real = realpath($path);
            if ($real === false || !is_file($real) || !str_starts_with($real, $dir . DIRECTORY_SEPARATOR)) {
                continue;
            }
            $files[] = [$name, $real];
        }
        usort($files, static fn (array $a, array $b): int => strnatcasecmp($a[0], $b[0]));
        $images = [];
        foreach ($files as [$name, $real]) {
            $width = 1080;
            $height = 1920;
            if ($ext = strtolower(pathinfo($name, PATHINFO_EXTENSION))) {
                if ($ext !== 'svg') {
                    $info = @getimagesize($real);
                    if (is_array($info) && isset($info[0], $info[1]) && $info[0] > 0 && $info[1] > 0) {
                        $width = (int) $info[0];
                        $height = (int) $info[1];
                    }
                }
            }
            $images[] = [
                'fileName' => $name,
                'label' => pathinfo($name, PATHINFO_FILENAME),
                'url' => '/' . $folder . '/' . rawurlencode($name),
                'width' => $width,
                'height' => $height,
            ];
        }
        return $images;
    }
}
