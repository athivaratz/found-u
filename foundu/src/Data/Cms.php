<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Database;
use Foundu\Http\HttpError;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// Reads for the blog and help pages that still render on the server.
// Writes stay 501 until the CMS phase. Authz runs first, so a guest is 401
// and a student is 403 on those writes.
final class Cms
{
    public static function register(App $app, \Closure $pdo): void
    {
        $app->get('/articles', static function ($request, $response) use ($pdo) {
            return self::published($request, $response, Gate::db($pdo));
        });
        $app->get('/articles/{slug}', static function ($request, $response, array $args) use ($pdo) {
            return self::publishedOne($request, $response, Gate::db($pdo), (string) ($args['slug'] ?? ''));
        });
        $app->get('/admin/articles', static function ($request, $response) use ($pdo) {
            return self::adminList($request, $response, Gate::db($pdo));
        });
        $app->get('/admin/articles/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::adminOne($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->post('/admin/articles', static function ($request, $response) {
            self::later($request, 'articles', 'insert', ['status' => 'draft']);
        });
        $app->patch('/admin/articles/{id}', static function ($request, $response) {
            self::later($request, 'articles', 'update');
        });
        $app->delete('/admin/articles/{id}', static function ($request, $response) {
            self::later($request, 'articles', 'delete');
        });
        $app->get('/help/{slug}', static function ($request, $response, array $args) use ($pdo) {
            return self::help($request, $response, Gate::db($pdo), (string) ($args['slug'] ?? ''));
        });
        $app->get('/admin/help-pages', static function ($request, $response) use ($pdo) {
            return self::helpPages($request, $response, Gate::db($pdo));
        });
        $app->post('/admin/help-pages', static function ($request, $response) {
            self::later($request, 'help_pages', 'insert');
        });
        $app->patch('/admin/help-pages/{slug}', static function ($request, $response) {
            self::later($request, 'help_pages', 'update');
        });
        $app->post('/admin/help-sections', static function ($request, $response) {
            self::later($request, 'help_sections', 'insert');
        });
        $app->patch('/admin/help-sections/{id}', static function ($request, $response) {
            self::later($request, 'help_sections', 'update');
        });
        $app->delete('/admin/help-sections/{id}', static function ($request, $response) {
            self::later($request, 'help_sections', 'delete');
        });
    }

    private static function published(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('articles', 'select', Gate::actor($request), ['status' => 'published']);
        $query = $request->getQueryParams();
        $where = ["status = 'published'"];
        $params = [];
        if (isset($query['section']) && $query['section'] !== '') {
            $section = Values::text($query['section'], 'section', 16, true);
            if ($section !== 'blog' && $section !== 'help') {
                throw new HttpError(400, 'invalid_input', ['field' => 'section']);
            }
            $where[] = 'section = ?';
            $params[] = $section;
        }
        if (isset($query['tag']) && $query['tag'] !== '') {
            $tag = Values::text($query['tag'], 'tag', 64, true);
            $where[] = 'JSON_CONTAINS(tags, JSON_QUOTE(?))';
            $params[] = $tag;
        }
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::articleColumns() . ' FROM articles WHERE ' . implode(' AND ', $where) . ' ORDER BY published_at DESC LIMIT 100',
            $params
        )->fetchAll();
        return Reply::public($request, $response, ['articles' => self::articles($rows)]);
    }

    private static function publishedOne(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $slug): ResponseInterface
    {
        Gate::demand('articles', 'select', Gate::actor($request), ['status' => 'published']);
        $slug = Values::text($slug, 'slug', 191, true);
        $params = [$slug];
        $sectionSql = '';
        $query = $request->getQueryParams();
        if (isset($query['section']) && $query['section'] !== '') {
            $section = Values::text($query['section'], 'section', 16, true);
            $sectionSql = ' AND section = ?';
            $params[] = $section;
        }
        $row = Database::run(
            $pdo,
            'SELECT ' . self::articleColumns() . " FROM articles WHERE slug = ? AND status = 'published'" . $sectionSql . ' LIMIT 1',
            $params
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return Reply::public($request, $response, ['article' => self::article($row)]);
    }

    private static function adminList(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('articles', 'select', Gate::actor($request));
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::articleColumns() . ' FROM articles ORDER BY updated_at DESC LIMIT 200'
        )->fetchAll();
        return Reply::json($response, 200, ['articles' => self::articles($rows)]);
    }

    private static function adminOne(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        $row = Database::run(
            $pdo,
            'SELECT ' . self::articleColumns() . ' FROM articles WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        Gate::demand('articles', 'select', Gate::actor($request), $row);
        return Reply::json($response, 200, ['article' => self::article($row)]);
    }

    private static function help(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $slug): ResponseInterface
    {
        Gate::demand('help_pages', 'select', Gate::actor($request));
        $slug = Values::text($slug, 'slug', 128, true);
        $page = Database::run(
            $pdo,
            'SELECT slug, title, description, intro, updated_at FROM help_pages WHERE slug = ? LIMIT 1',
            [$slug]
        )->fetch();
        if (!is_array($page)) {
            throw new HttpError(404, 'not_found');
        }
        $sections = Database::run(
            $pdo,
            'SELECT id, page_slug, section_type, audience, title, body, image_url, sort_order, created_at
             FROM help_sections WHERE page_slug = ? ORDER BY sort_order ASC, id ASC LIMIT 200',
            [$slug]
        )->fetchAll();
        $mapped = [];
        foreach ($sections as $row) {
            if (is_array($row)) {
                $mapped[] = self::section($row);
            }
        }
        return Reply::public($request, $response, [
            'page' => self::page($page),
            'sections' => $mapped,
        ]);
    }

    private static function helpPages(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('help_pages', 'select', Gate::actor($request));
        $rows = Database::run(
            $pdo,
            'SELECT slug, title, description, intro, updated_at FROM help_pages ORDER BY slug ASC LIMIT 200'
        )->fetchAll();
        $pages = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $pages[] = self::page($row);
            }
        }
        return Reply::json($response, 200, ['pages' => $pages]);
    }

    private static function later(ServerRequestInterface $request, string $table, string $op, array $row = []): never
    {
        Gate::demand($table, $op, Gate::actor($request), $row);
        throw new HttpError(501, 'not_ready');
    }

    private static function articleColumns(): string
    {
        return 'id, slug, section, status, title, excerpt, cover_image_url, author_name, tags, content_json, published_at, created_at, updated_at';
    }

    private static function articles(array $rows): array
    {
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::article($row);
            }
        }
        return $items;
    }

    private static function article(array $row): array
    {
        $tags = Values::jsonList($row['tags'] ?? []);
        $content = Values::jsonObject($row['content_json'] ?? null) ?? ['type' => 'doc', 'content' => []];
        return [
            'id' => (string) $row['id'],
            'slug' => (string) $row['slug'],
            'section' => (string) $row['section'],
            'status' => (string) $row['status'],
            'title' => (string) $row['title'],
            'excerpt' => $row['excerpt'] !== null ? (string) $row['excerpt'] : null,
            'cover_image_url' => $row['cover_image_url'] !== null ? (string) $row['cover_image_url'] : null,
            'author_name' => $row['author_name'] !== null ? (string) $row['author_name'] : null,
            'tags' => array_values(array_map('strval', $tags)),
            'content_json' => $content,
            'published_at' => Time::iso($row['published_at']),
            'created_at' => Time::iso($row['created_at']),
            'updated_at' => Time::iso($row['updated_at']),
        ];
    }

    private static function page(array $row): array
    {
        return [
            'slug' => (string) $row['slug'],
            'title' => (string) $row['title'],
            'description' => $row['description'] !== null ? (string) $row['description'] : null,
            'intro' => $row['intro'] !== null ? (string) $row['intro'] : null,
            'updated_at' => Time::iso($row['updated_at']),
        ];
    }

    private static function section(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'page_slug' => (string) $row['page_slug'],
            'section_type' => (string) $row['section_type'],
            'audience' => (string) $row['audience'],
            'title' => (string) $row['title'],
            'body' => (string) $row['body'],
            'image_url' => $row['image_url'] !== null ? (string) $row['image_url'] : null,
            'sort_order' => (int) $row['sort_order'],
            'created_at' => Time::iso($row['created_at']),
        ];
    }
}
