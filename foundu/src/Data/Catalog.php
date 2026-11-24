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

final class Catalog
{
    private const SPECS = [
        'categories' => ['path' => '/categories', 'key' => 'categories', 'one' => 'category', 'icon' => true, 'placeholder' => false],
        'locations' => ['path' => '/locations', 'key' => 'locations', 'one' => 'location', 'icon' => false, 'placeholder' => false],
        'contact_types' => ['path' => '/contact-types', 'key' => 'contactTypes', 'one' => 'contactType', 'icon' => true, 'placeholder' => true],
        'drop_off_locations' => ['path' => '/drop-off-locations', 'key' => 'dropOffLocations', 'one' => 'dropOffLocation', 'icon' => false, 'placeholder' => false],
    ];

    public static function register(App $app, \Closure $pdo): void
    {
        foreach (self::SPECS as $table => $spec) {
            $app->get($spec['path'], static function ($request, $response) use ($pdo, $table) {
                return self::list($request, $response, Gate::db($pdo), $table);
            });
            $app->post($spec['path'], static function ($request, $response) use ($pdo, $table) {
                return self::create($request, $response, Gate::db($pdo), $table);
            });
            $app->patch($spec['path'] . '/{id}', static function ($request, $response, array $args) use ($pdo, $table) {
                return self::update($request, $response, Gate::db($pdo), $table, (string) ($args['id'] ?? ''));
            });
            $app->delete($spec['path'] . '/{id}', static function ($request, $response, array $args) use ($pdo, $table) {
                return self::delete($request, $response, Gate::db($pdo), $table, (string) ($args['id'] ?? ''));
            });
        }
    }

    private static function list(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $table): ResponseInterface
    {
        Gate::demand($table, 'select', Gate::actor($request));
        $spec = self::SPECS[$table];
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::columns($table) . ' FROM ' . self::from($table) . ' ORDER BY sort_order ASC, value ASC LIMIT 200'
        )->fetchAll();
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::map($table, $row);
            }
        }
        return Reply::public($request, $response, [$spec['key'] => $items]);
    }

    private static function create(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $table): ResponseInterface
    {
        Gate::demand($table, 'insert', Gate::actor($request));
        $body = self::body($request);
        $fields = self::fields($table, $body, true);
        $id = Ids::uuid();
        Feed::write($pdo, $table, static function (PDO $pdo) use ($table, $id, $fields): void {
            if ($table === 'contact_types') {
                Database::run(
                    $pdo,
                    'INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                    [$id, $fields['value'], $fields['label'], $fields['icon'], $fields['placeholder'], $fields['order']]
                );
                return;
            }
            if ($table === 'categories') {
                Database::run(
                    $pdo,
                    'INSERT INTO categories (id, value, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
                    [$id, $fields['value'], $fields['label'], $fields['icon'], $fields['order']]
                );
                return;
            }
            $sql = $table === 'locations'
                ? 'INSERT INTO locations (id, value, label, sort_order) VALUES (?, ?, ?, ?)'
                : 'INSERT INTO drop_off_locations (id, value, label, sort_order) VALUES (?, ?, ?, ?)';
            Database::run($pdo, $sql, [$id, $fields['value'], $fields['label'], $fields['order']]);
        });
        $row = self::fetch($pdo, $table, $id);
        return Reply::json($response, 201, ['id' => $id, self::SPECS[$table]['one'] => self::map($table, $row)]);
    }

    private static function update(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $table, string $id): ResponseInterface
    {
        Gate::demand($table, 'update', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        $body = self::body($request);
        $fields = self::fields($table, $body, false);
        if ($fields === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        Feed::write($pdo, $table, static function (PDO $pdo) use ($table, $id, $fields): void {
            $sets = [];
            $params = [];
            foreach (['value' => 'value', 'label' => 'label', 'icon' => 'icon', 'placeholder' => 'placeholder', 'order' => 'sort_order'] as $key => $column) {
                if (!array_key_exists($key, $fields)) {
                    continue;
                }
                $sets[] = $column . ' = ?';
                $params[] = $fields[$key];
            }
            $params[] = $id;
            $sql = 'UPDATE ' . self::from($table) . ' SET ' . implode(', ', $sets) . ' WHERE id = ?';
            $changed = Database::run($pdo, $sql, $params)->rowCount();
            if ($changed > 0) {
                return;
            }
            $exists = Database::run($pdo, 'SELECT id FROM ' . self::from($table) . ' WHERE id = ? LIMIT 1', [$id])->fetch();
            if (!is_array($exists)) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, [self::SPECS[$table]['one'] => self::map($table, self::fetch($pdo, $table, $id))]);
    }

    private static function delete(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $table, string $id): ResponseInterface
    {
        Gate::demand($table, 'delete', Gate::actor($request));
        $id = Values::uuid($id, 'id', true);
        Feed::write($pdo, $table, static function (PDO $pdo) use ($table, $id): void {
            $changed = Database::run($pdo, 'DELETE FROM ' . self::from($table) . ' WHERE id = ?', [$id])->rowCount();
            if ($changed < 1) {
                throw new HttpError(404, 'not_found');
            }
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    private static function from(string $table): string
    {
        return match ($table) {
            'categories' => 'categories',
            'locations' => 'locations',
            'contact_types' => 'contact_types',
            'drop_off_locations' => 'drop_off_locations',
            default => throw new HttpError(500, 'server_error'),
        };
    }

    private static function columns(string $table): string
    {
        $spec = self::SPECS[$table];
        $sql = 'id, value, label, sort_order';
        if ($spec['icon']) {
            $sql .= ', icon';
        }
        if ($spec['placeholder']) {
            $sql .= ', placeholder';
        }
        return $sql;
    }

    private static function fields(string $table, array $body, bool $create): array
    {
        $spec = self::SPECS[$table];
        $allowed = ['value', 'label', 'order'];
        if ($spec['icon']) {
            $allowed[] = 'icon';
        }
        if ($spec['placeholder']) {
            $allowed[] = 'placeholder';
        }
        Values::only($body, $allowed);
        $fields = [];
        if ($create || array_key_exists('value', $body)) {
            $value = Values::text($body['value'] ?? null, 'value', 64, true);
            if (preg_match('/^[a-z0-9_]{1,64}$/', $value) !== 1) {
                throw new HttpError(400, 'invalid_input', ['field' => 'value']);
            }
            $fields['value'] = $value;
        }
        if ($create || array_key_exists('label', $body)) {
            $fields['label'] = Values::text($body['label'] ?? null, 'label', 255, true);
        }
        if ($spec['icon'] && ($create || array_key_exists('icon', $body))) {
            $fields['icon'] = Values::text($body['icon'] ?? '📦', 'icon', 32, true);
        }
        if ($spec['placeholder'] && ($create || array_key_exists('placeholder', $body))) {
            $fields['placeholder'] = Values::text($body['placeholder'] ?? '', 'placeholder', 255, false) ?? '';
        }
        if ($create || array_key_exists('order', $body)) {
            if (!array_key_exists('order', $body)) {
                $fields['order'] = 0;
            } elseif (!is_int($body['order']) || $body['order'] < 0 || $body['order'] > 10000) {
                throw new HttpError(400, 'invalid_input', ['field' => 'order']);
            } else {
                $fields['order'] = $body['order'];
            }
        }
        return $fields;
    }

    private static function fetch(PDO $pdo, string $table, string $id): array
    {
        $row = Database::run(
            $pdo,
            'SELECT ' . self::columns($table) . ' FROM ' . self::from($table) . ' WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    private static function map(string $table, array $row): array
    {
        $spec = self::SPECS[$table];
        $item = [
            'id' => (string) $row['id'],
            'value' => (string) $row['value'],
            'label' => (string) $row['label'],
            'order' => (int) $row['sort_order'],
        ];
        if ($spec['icon']) {
            $item['icon'] = (string) ($row['icon'] ?? '');
        }
        if ($spec['placeholder']) {
            $item['placeholder'] = (string) ($row['placeholder'] ?? '');
        }
        return $item;
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
