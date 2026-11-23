<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Cms\Doc;
use Foundu\Cms\Html;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Ids;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// Blog and help. Public article reads are published rows only.
// The JSON stays snake_case because lib/blog/map.ts reads those keys.
// Writes are admin-only. Rich text is cleaned before it is stored.
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
        $app->post('/admin/articles', static function ($request, $response) use ($pdo) {
            return self::createArticle($request, $response, Gate::db($pdo));
        });
        $app->patch('/admin/articles/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::updateArticle($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->delete('/admin/articles/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::deleteArticle($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->get('/help/{slug}', static function ($request, $response, array $args) use ($pdo) {
            return self::help($request, $response, Gate::db($pdo), (string) ($args['slug'] ?? ''));
        });
        $app->get('/admin/help-pages', static function ($request, $response) use ($pdo) {
            return self::helpPages($request, $response, Gate::db($pdo));
        });
        $app->post('/admin/help-pages', static function ($request, $response) use ($pdo) {
            return self::createPage($request, $response, Gate::db($pdo));
        });
        $app->patch('/admin/help-pages/{slug}', static function ($request, $response, array $args) use ($pdo) {
            return self::updatePage($request, $response, Gate::db($pdo), (string) ($args['slug'] ?? ''));
        });
        $app->post('/admin/help-sections', static function ($request, $response) use ($pdo) {
            return self::createSection($request, $response, Gate::db($pdo));
        });
        $app->patch('/admin/help-sections/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::updateSection($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->delete('/admin/help-sections/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::deleteSection($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
    }

    private static function published(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('articles', 'select', Gate::actor($request), ['status' => 'published']);
        $query = $request->getQueryParams();
        $where = ["status = 'published'"];
        $params = [];
        if (isset($query['section']) && $query['section'] !== '') {
            $section = self::sectionName($query['section']);
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
        $slug = self::slug($slug, 191);
        $params = [$slug];
        $sectionSql = '';
        $query = $request->getQueryParams();
        if (isset($query['section']) && $query['section'] !== '') {
            $sectionSql = ' AND section = ?';
            $params[] = self::sectionName($query['section']);
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
        $row = self::articleRow($pdo, $id);
        Gate::demand('articles', 'select', Gate::actor($request), $row);
        return Reply::json($response, 200, ['article' => self::article($row)]);
    }

    private static function createArticle(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('articles', 'insert', Gate::actor($request), ['status' => 'draft']);
        $body = self::body($request);
        Values::only($body, [
            'title', 'slug', 'section', 'status', 'excerpt', 'cover_image_url',
            'author_name', 'tags', 'content_json', 'published_at', 'updated_at',
        ]);
        $fields = self::articleFields($body, true);
        self::slugFree($pdo, $fields['slug'], null);
        $id = Ids::uuid();
        Feed::write($pdo, 'articles', static function (PDO $pdo) use ($id, $fields): void {
            Database::run(
                $pdo,
                'INSERT INTO articles (
                    id, slug, section, status, title, excerpt, cover_image_url, author_name, tags, content_json, published_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $id, $fields['slug'], $fields['section'], $fields['status'], $fields['title'],
                    $fields['excerpt'], $fields['cover'], $fields['author'], $fields['tags'],
                    $fields['content'], $fields['published'],
                ]
            );
        });
        return Reply::json($response, 201, ['article' => self::article(self::articleRow($pdo, $id))]);
    }

    private static function updateArticle(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        $current = self::articleRow($pdo, $id);
        Gate::demand('articles', 'update', Gate::actor($request), $current);
        $body = self::body($request);
        Values::only($body, [
            'title', 'slug', 'section', 'status', 'excerpt', 'cover_image_url',
            'author_name', 'tags', 'content_json', 'published_at', 'updated_at',
        ]);
        $fields = self::articleFields($body, false, $current);
        self::slugFree($pdo, $fields['slug'], $id);
        Feed::write($pdo, 'articles', static function (PDO $pdo) use ($id, $fields): void {
            Database::run(
                $pdo,
                'UPDATE articles SET slug = ?, section = ?, status = ?, title = ?, excerpt = ?, cover_image_url = ?,
                    author_name = ?, tags = ?, content_json = ?, published_at = ? WHERE id = ?',
                [
                    $fields['slug'], $fields['section'], $fields['status'], $fields['title'],
                    $fields['excerpt'], $fields['cover'], $fields['author'], $fields['tags'],
                    $fields['content'], $fields['published'], $id,
                ]
            );
        });
        return Reply::json($response, 200, ['article' => self::article(self::articleRow($pdo, $id))]);
    }

    private static function deleteArticle(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        $current = self::articleRow($pdo, $id);
        Gate::demand('articles', 'delete', Gate::actor($request), $current);
        Feed::write($pdo, 'articles', static function (PDO $pdo) use ($id): void {
            Database::run($pdo, 'DELETE FROM articles WHERE id = ?', [$id]);
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    private static function help(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $slug): ResponseInterface
    {
        Gate::demand('help_pages', 'select', Gate::actor($request));
        $slug = self::slug($slug, 128);
        $page = self::pageRow($pdo, $slug);
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

    private static function createPage(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('help_pages', 'insert', Gate::actor($request));
        $body = self::body($request);
        Values::only($body, ['slug', 'title', 'description', 'intro']);
        $slug = self::slug($body['slug'] ?? null, 128);
        $title = Values::text($body['title'] ?? null, 'title', 255, true);
        $description = self::rich($body['description'] ?? null, 'description', 2000, false);
        $intro = self::rich($body['intro'] ?? null, 'intro', 8000, false);
        Feed::write($pdo, 'help_pages', static function (PDO $pdo) use ($slug, $title, $description, $intro): void {
            Database::run(
                $pdo,
                'INSERT INTO help_pages (slug, title, description, intro) VALUES (?, ?, ?, ?)',
                [$slug, $title, $description, $intro]
            );
        });
        return Reply::json($response, 201, ['page' => self::page(self::pageRow($pdo, $slug))]);
    }

    private static function updatePage(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $slug): ResponseInterface
    {
        $slug = self::slug($slug, 128);
        $current = self::pageRow($pdo, $slug);
        Gate::demand('help_pages', 'update', Gate::actor($request));
        $body = self::body($request);
        Values::only($body, ['title', 'description', 'intro']);
        $title = array_key_exists('title', $body)
            ? Values::text($body['title'], 'title', 255, true)
            : (string) $current['title'];
        $description = array_key_exists('description', $body)
            ? self::rich($body['description'], 'description', 2000, false)
            : $current['description'];
        $intro = array_key_exists('intro', $body)
            ? self::rich($body['intro'], 'intro', 8000, false)
            : $current['intro'];
        Feed::write($pdo, 'help_pages', static function (PDO $pdo) use ($slug, $title, $description, $intro): void {
            Database::run(
                $pdo,
                'UPDATE help_pages SET title = ?, description = ?, intro = ? WHERE slug = ?',
                [$title, $description, $intro, $slug]
            );
        });
        return Reply::json($response, 200, ['page' => self::page(self::pageRow($pdo, $slug))]);
    }

    private static function createSection(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        Gate::demand('help_sections', 'insert', Gate::actor($request));
        $body = self::body($request);
        Values::only($body, ['page_slug', 'section_type', 'audience', 'title', 'body', 'image_url', 'sort_order']);
        $page = self::slug($body['page_slug'] ?? null, 128);
        self::pageRow($pdo, $page);
        $id = Ids::uuid();
        $fields = self::sectionFields($body, true);
        Feed::write($pdo, 'help_sections', static function (PDO $pdo) use ($id, $page, $fields): void {
            Database::run(
                $pdo,
                'INSERT INTO help_sections (id, page_slug, section_type, audience, title, body, image_url, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $page, $fields['type'], $fields['audience'], $fields['title'], $fields['body'], $fields['image'], $fields['order']]
            );
        });
        return Reply::json($response, 201, ['section' => self::section(self::sectionRow($pdo, $id))]);
    }

    private static function updateSection(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        $current = self::sectionRow($pdo, $id);
        Gate::demand('help_sections', 'update', Gate::actor($request));
        $body = self::body($request);
        Values::only($body, ['section_type', 'audience', 'title', 'body', 'image_url', 'sort_order']);
        $fields = self::sectionFields($body, false, $current);
        Feed::write($pdo, 'help_sections', static function (PDO $pdo) use ($id, $fields): void {
            Database::run(
                $pdo,
                'UPDATE help_sections SET section_type = ?, audience = ?, title = ?, body = ?, image_url = ?, sort_order = ? WHERE id = ?',
                [$fields['type'], $fields['audience'], $fields['title'], $fields['body'], $fields['image'], $fields['order'], $id]
            );
        });
        return Reply::json($response, 200, ['section' => self::section(self::sectionRow($pdo, $id))]);
    }

    private static function deleteSection(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        self::sectionRow($pdo, $id);
        Gate::demand('help_sections', 'delete', Gate::actor($request));
        Feed::write($pdo, 'help_sections', static function (PDO $pdo) use ($id): void {
            Database::run($pdo, 'DELETE FROM help_sections WHERE id = ?', [$id]);
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    private static function articleFields(array $body, bool $creating, array $current = []): array
    {
        $title = array_key_exists('title', $body) || $creating
            ? Values::text($body['title'] ?? null, 'title', 255, true)
            : (string) $current['title'];
        $slug = array_key_exists('slug', $body) || $creating
            ? self::slug($body['slug'] ?? null, 191)
            : (string) $current['slug'];
        $section = array_key_exists('section', $body) || $creating
            ? self::sectionName($body['section'] ?? 'blog')
            : (string) $current['section'];
        $status = array_key_exists('status', $body) || $creating
            ? self::status($body['status'] ?? 'draft')
            : (string) $current['status'];
        $excerpt = array_key_exists('excerpt', $body)
            ? Values::text($body['excerpt'], 'excerpt', 500, false)
            : ($creating ? null : $current['excerpt']);
        $cover = array_key_exists('cover_image_url', $body)
            ? Values::httpsOrPath($body['cover_image_url'], 'cover_image_url', false)
            : ($creating ? null : $current['cover_image_url']);
        $author = array_key_exists('author_name', $body)
            ? Values::text($body['author_name'], 'author_name', 255, false)
            : ($creating ? null : $current['author_name']);
        if (array_key_exists('tags', $body) || $creating) {
            $tags = self::tags($body['tags'] ?? []);
        } else {
            $tags = is_string($current['tags']) ? $current['tags'] : json_encode(Values::jsonList($current['tags']), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        if (array_key_exists('content_json', $body) || $creating) {
            $content = json_encode(Doc::clean($body['content_json'] ?? ['type' => 'doc', 'content' => []]), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } else {
            $content = is_string($current['content_json'])
                ? $current['content_json']
                : json_encode($current['content_json'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        if ($status === 'draft') {
            $published = null;
        } elseif (array_key_exists('published_at', $body) && $body['published_at'] !== null) {
            $published = Time::sql($body['published_at'], 'published_at');
        } elseif (!$creating && $current['published_at'] !== null) {
            $published = (string) $current['published_at'];
        } else {
            $published = Ids::utc(time());
        }
        return [
            'title' => $title,
            'slug' => $slug,
            'section' => $section,
            'status' => $status,
            'excerpt' => $excerpt,
            'cover' => $cover,
            'author' => $author,
            'tags' => $tags,
            'content' => $content,
            'published' => $published,
        ];
    }

    private static function sectionFields(array $body, bool $creating, array $current = []): array
    {
        $type = array_key_exists('section_type', $body) || $creating
            ? self::enum($body['section_type'] ?? 'step', 'section_type', ['step', 'note', 'faq'])
            : (string) $current['section_type'];
        $audience = array_key_exists('audience', $body) || $creating
            ? self::enum($body['audience'] ?? 'all', 'audience', ['all', 'student', 'admin'])
            : (string) $current['audience'];
        $title = array_key_exists('title', $body) || $creating
            ? Values::text($body['title'] ?? null, 'title', 255, true)
            : (string) $current['title'];
        $text = array_key_exists('body', $body) || $creating
            ? self::rich($body['body'] ?? null, 'body', 20000, true)
            : (string) $current['body'];
        $image = array_key_exists('image_url', $body)
            ? Values::httpsOrPath($body['image_url'], 'image_url', false)
            : ($creating ? null : $current['image_url']);
        $order = array_key_exists('sort_order', $body)
            ? self::order($body['sort_order'])
            : ($creating ? 0 : (int) $current['sort_order']);
        return [
            'type' => $type,
            'audience' => $audience,
            'title' => $title,
            'body' => $text,
            'image' => $image,
            'order' => $order,
        ];
    }

    private static function slugFree(PDO $pdo, string $slug, ?string $exceptId): void
    {
        $row = Database::run($pdo, 'SELECT id FROM articles WHERE slug = ? LIMIT 1', [$slug])->fetch();
        if (is_array($row) && (string) $row['id'] !== $exceptId) {
            throw new HttpError(409, 'conflict', ['field' => 'slug']);
        }
    }

    private static function articleRow(PDO $pdo, string $id): array
    {
        $row = Database::run(
            $pdo,
            'SELECT ' . self::articleColumns() . ' FROM articles WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    private static function pageRow(PDO $pdo, string $slug): array
    {
        $row = Database::run(
            $pdo,
            'SELECT slug, title, description, intro, updated_at FROM help_pages WHERE slug = ? LIMIT 1',
            [$slug]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    private static function sectionRow(PDO $pdo, string $id): array
    {
        $row = Database::run(
            $pdo,
            'SELECT id, page_slug, section_type, audience, title, body, image_url, sort_order, created_at
             FROM help_sections WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }

    private static function slug(mixed $value, int $max): string
    {
        $text = Values::text($value, 'slug', $max, true);
        $text = mb_strtolower($text);
        if (preg_match('/^[a-z0-9\x{0E00}-\x{0E7F}]+(?:-[a-z0-9\x{0E00}-\x{0E7F}]+)*$/u', $text) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'slug']);
        }
        return $text;
    }

    private static function sectionName(mixed $value): string
    {
        $text = Values::text($value, 'section', 16, true);
        if ($text !== 'blog' && $text !== 'help') {
            throw new HttpError(400, 'invalid_input', ['field' => 'section']);
        }
        return $text;
    }

    private static function status(mixed $value): string
    {
        $text = Values::text($value, 'status', 16, true);
        if ($text !== 'draft' && $text !== 'published') {
            throw new HttpError(400, 'invalid_input', ['field' => 'status']);
        }
        return $text;
    }

    private static function enum(mixed $value, string $field, array $allowed): string
    {
        $text = Values::text($value, $field, 16, true);
        if (!in_array($text, $allowed, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $text;
    }

    private static function tags(mixed $value): string
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 20) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tags']);
        }
        $tags = [];
        foreach ($value as $tag) {
            $tags[] = Values::text($tag, 'tags', 64, true);
        }
        return json_encode($tags, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private static function rich(mixed $value, string $field, int $max, bool $required): ?string
    {
        $text = Values::text($value, $field, $max, $required);
        if ($text === null) {
            return null;
        }
        $clean = Html::fragment($text);
        if (mb_strlen($clean) > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        return $clean;
    }

    private static function order(mixed $value): int
    {
        if (!is_int($value) || $value < -1000000 || $value > 1000000) {
            throw new HttpError(400, 'invalid_input', ['field' => 'sort_order']);
        }
        return $value;
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
        $content = self::content($row['content_json'] ?? null);
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

    private static function content(mixed $value): array
    {
        if (is_array($value) && !array_is_list($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return ['type' => 'doc', 'content' => []];
        }
        try {
            $decoded = json_decode($value, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return ['type' => 'doc', 'content' => []];
        }
        return is_array($decoded) && !array_is_list($decoded) ? $decoded : ['type' => 'doc', 'content' => []];
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
