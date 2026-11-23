<?php

declare(strict_types=1);

namespace Foundu\Seo;

use Foundu\Data\Settings;
use Foundu\Database;
use PDO;

// Fills <title>, description, canonical, and Open Graph tags for one
// blog or help URL. P11's static shell is the rest of the document.
final class Document
{
    public static function render(PDO $pdo, string $kind, string $slug, string $shell, string $origin): array
    {
        $origin = rtrim($origin, '/');
        $meta = self::meta($pdo, $kind, $slug, $origin);
        return [
            'status' => $meta['found'] ? 200 : 404,
            'html' => self::inject($shell !== '' ? $shell : self::emptyShell(), $meta),
            'meta' => $meta,
        ];
    }

    public static function meta(PDO $pdo, string $kind, string $slug, string $origin): array
    {
        $settings = Settings::read($pdo);
        $siteTitle = is_string($settings['ogTitle'] ?? null) && $settings['ogTitle'] !== ''
            ? $settings['ogTitle']
            : 'Found-U';
        $siteDescription = is_string($settings['ogDescription'] ?? null) && $settings['ogDescription'] !== ''
            ? $settings['ogDescription']
            : 'ระบบแจ้งของหาย-ของเจอ';
        $found = false;
        $title = $siteTitle;
        $description = $siteDescription;
        $type = 'website';
        if ($kind === 'blog' || $kind === 'help') {
            $row = self::article($pdo, $kind, $slug);
            if ($row !== null) {
                $found = true;
                $title = (string) $row['title'];
                if (is_string($row['excerpt']) && $row['excerpt'] !== '') {
                    $description = $row['excerpt'];
                }
                $type = 'article';
            } elseif ($kind === 'help') {
                $page = self::help($pdo, $slug);
                if ($page !== null) {
                    $found = true;
                    $title = (string) $page['title'];
                    if (is_string($page['description']) && $page['description'] !== '') {
                        $description = $page['description'];
                    }
                }
            }
        }
        if (!$found && $kind === 'blog') {
            $title = 'ไม่พบบทความ';
        }
        if (!$found && $kind === 'help') {
            $title = 'ไม่พบคู่มือ';
        }
        $path = '/' . $kind . '/' . rawurlencode($slug);
        $image = $origin . '/og/' . $kind . '/' . rawurlencode($slug) . '.png';
        return [
            'found' => $found,
            'title' => $title,
            'description' => self::plain($description),
            'canonical' => $origin . $path,
            'type' => $type,
            'image' => $image,
            'imageAlt' => $title,
        ];
    }

    public static function inject(string $html, array $meta): string
    {
        $html = preg_replace('#<title\b[^>]*>.*?</title>#is', '', $html) ?? $html;
        $html = preg_replace('#<meta\b[^>]*(?:name=["\'](?:description|robots)["\']|property=["\']og:[^"\']+["\']|name=["\']twitter:[^"\']+["\'])[^>]*>#i', '', $html) ?? $html;
        $html = preg_replace('#<link\b[^>]*rel=["\']canonical["\'][^>]*>#i', '', $html) ?? $html;
        $block = self::block($meta);
        if (preg_match('#</head>#i', $html) === 1) {
            return (string) preg_replace('#</head>#i', $block . '</head>', $html, 1);
        }
        return $block . $html;
    }

    public static function emptyShell(): string
    {
        return "<!DOCTYPE html>\n<html lang=\"th\">\n<head>\n<meta charset=\"utf-8\">\n</head>\n<body>\n<div id=\"__next\"></div>\n</body>\n</html>\n";
    }

    private static function block(array $meta): string
    {
        $title = self::esc((string) $meta['title']);
        $description = self::esc((string) $meta['description']);
        $canonical = self::esc((string) $meta['canonical']);
        $image = self::esc((string) $meta['image']);
        $alt = self::esc((string) $meta['imageAlt']);
        $type = self::esc((string) $meta['type']);
        $robots = ($meta['found'] ?? false) ? '' : "<meta name=\"robots\" content=\"noindex\">\n";
        return $robots
            . '<title>' . $title . "</title>\n"
            . '<meta name="description" content="' . $description . "\">\n"
            . '<link rel="canonical" href="' . $canonical . "\">\n"
            . '<meta property="og:title" content="' . $title . "\">\n"
            . '<meta property="og:description" content="' . $description . "\">\n"
            . '<meta property="og:url" content="' . $canonical . "\">\n"
            . '<meta property="og:type" content="' . $type . "\">\n"
            . '<meta property="og:locale" content="th_TH">'."\n"
            . '<meta property="og:image" content="' . $image . "\">\n"
            . '<meta property="og:image:alt" content="' . $alt . "\">\n"
            . "<meta name=\"twitter:card\" content=\"summary_large_image\">\n"
            . '<meta name="twitter:title" content="' . $title . "\">\n"
            . '<meta name="twitter:description" content="' . $description . "\">\n"
            . '<meta name="twitter:image" content="' . $image . "\">\n";
    }

    private static function article(PDO $pdo, string $section, string $slug): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT title, excerpt FROM articles WHERE slug = ? AND section = ? AND status = \'published\' LIMIT 1',
            [$slug, $section]
        )->fetch();
        return is_array($row) ? $row : null;
    }

    private static function help(PDO $pdo, string $slug): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT title, description FROM help_pages WHERE slug = ? LIMIT 1',
            [$slug]
        )->fetch();
        return is_array($row) ? $row : null;
    }

    private static function plain(string $value): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', strip_tags($value)) ?? $value);
        if (mb_strlen($value) > 300) {
            return mb_substr($value, 0, 297) . '...';
        }
        return $value;
    }

    private static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
