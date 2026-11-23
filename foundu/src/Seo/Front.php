<?php

declare(strict_types=1);

namespace Foundu\Seo;

use Foundu\Config;
use Foundu\Database;
use Foundu\Http\ClientAddress;
use Foundu\RateLimit\Limiter;

// Serves the exported HTML shell for /blog/* and /help/*, and the PNG
// that replaces app/blog/[slug]/opengraph-image. Apache rewrites those
// paths here. A direct hit on meta.php or og.php stays forbidden.
final class Front
{
    public static function page(string $appRoot, string $publicRoot): void
    {
        $kind = $_GET['kind'] ?? '';
        $slug = $_GET['slug'] ?? '';
        if (!is_string($kind) || ($kind !== 'blog' && $kind !== 'help') || !is_string($slug)) {
            self::text(404, 'not found');
            return;
        }
        $slug = rawurldecode($slug);
        if (self::badSlug($slug)) {
            self::text(404, 'not found');
            return;
        }
        try {
            $config = Config::load($appRoot);
            $pdo = Database::connection($config);
            self::limit($appRoot, $config, $pdo, 'seo_page', 60, 60);
            $shellPath = $publicRoot . '/' . $kind . '/_/index.html';
            $shell = is_file($shellPath) ? (string) file_get_contents($shellPath) : '';
            $origin = rtrim((string) ($config['APP_URL'] ?? ''), '/');
            if ($origin === '') {
                $origin = 'http://localhost';
            }
            $rendered = Document::render($pdo, $kind, $slug, $shell, $origin);
        } catch (\Throwable $e) {
            self::text(500, 'unavailable');
            return;
        }
        http_response_code($rendered['status']);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: public, s-maxage=60, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo $rendered['html'];
    }

    public static function image(string $appRoot): void
    {
        $kind = $_GET['kind'] ?? '';
        $slug = $_GET['slug'] ?? '';
        if (!is_string($kind) || ($kind !== 'blog' && $kind !== 'help') || !is_string($slug)) {
            self::text(404, 'not found');
            return;
        }
        $slug = rawurldecode($slug);
        if (self::badSlug($slug)) {
            self::text(404, 'not found');
            return;
        }
        try {
            $config = Config::load($appRoot);
            $pdo = Database::connection($config);
            self::limit($appRoot, $config, $pdo, 'seo_og', 60, 60);
            $origin = rtrim((string) ($config['APP_URL'] ?? ''), '/');
            $meta = Document::meta($pdo, $kind, $slug, $origin !== '' ? $origin : 'http://localhost');
            $path = OgImage::file($appRoot, (string) $meta['title'], (string) $meta['description']);
        } catch (\Throwable $e) {
            self::text(500, 'unavailable');
            return;
        }
        $bytes = file_get_contents($path);
        if (!is_string($bytes) || $bytes === '') {
            self::text(500, 'unavailable');
            return;
        }
        http_response_code(200);
        header('Content-Type: image/png');
        header('Cache-Control: public, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . (string) strlen($bytes));
        echo $bytes;
    }

    private static function limit(string $appRoot, array $config, \PDO $pdo, string $scope, int $limit, int $window): void
    {
        $server = $_SERVER;
        if (!is_array($server)) {
            $server = [];
        }
        $client = ClientAddress::resolve(
            $server,
            (string) ($config['APP_ENV'] ?? 'production'),
            is_file($appRoot . '/config/mock-cf.on'),
            ClientAddress::ranges($appRoot)
        );
        $decision = Limiter::open()->hit($pdo, $scope, $client->ip, $limit, $window, time());
        if (!$decision->allowed) {
            self::text(429, 'too many requests');
            exit;
        }
    }

    private static function badSlug(string $slug): bool
    {
        if ($slug === '' || strlen($slug) > 191 || str_contains($slug, "\0") || str_contains($slug, '/') || str_contains($slug, '\\')) {
            return true;
        }
        return preg_match('/^[a-z0-9\x{0E00}-\x{0E7F}]+(?:-[a-z0-9\x{0E00}-\x{0E7F}]+)*$/u', mb_strtolower($slug)) !== 1;
    }

    private static function text(int $status, string $message): void
    {
        http_response_code($status);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: private, no-store');
        echo $message;
    }
}
