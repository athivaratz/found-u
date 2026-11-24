<?php

declare(strict_types=1);

namespace Foundu\Seo;

// 1200×630 card that used to be the edge opengraph-image route.
// GD draws it with Sarabun when the font file is present. The PNG is
// cached on disk so a crawler does not redraw it on every hit.
final class OgImage
{
    public static function file(string $appRoot, string $title, string $subtitle): string
    {
        $dir = $appRoot . '/storage/cache/og';
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            return self::writeTemp(self::png($appRoot, $title, $subtitle));
        }
        $font = self::font($appRoot);
        $key = hash('sha256', $title . "\n" . $subtitle . "\n" . (is_file($font) ? (string) filemtime($font) : '0'));
        $path = $dir . '/' . $key . '.png';
        if (is_file($path) && filesize($path) > 32) {
            return $path;
        }
        $bytes = self::png($appRoot, $title, $subtitle);
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $bytes) === false) {
            return self::writeTemp($bytes);
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            return self::writeTemp($bytes);
        }
        return $path;
    }

    public static function png(string $appRoot, string $title, string $subtitle): string
    {
        if (!function_exists('imagecreatetruecolor')) {
            return self::fallback();
        }
        $image = imagecreatetruecolor(1200, 630);
        if ($image === false) {
            return self::fallback();
        }
        imagealphablending($image, true);
        $navy = imagecolorallocate($image, 15, 23, 42);
        $green = imagecolorallocate($image, 6, 78, 59);
        $accent = imagecolorallocate($image, 6, 199, 85);
        $white = imagecolorallocate($image, 255, 255, 255);
        $muted = imagecolorallocate($image, 209, 250, 229);
        imagefilledrectangle($image, 0, 0, 1199, 629, $navy);
        imagefilledrectangle($image, 0, 360, 1199, 629, $green);
        imagefilledrectangle($image, 64, 64, 112, 112, $accent);
        $font = self::font($appRoot);
        $useFont = is_file($font) && function_exists('imagettftext');
        if ($useFont) {
            imagettftext($image, 28, 0, 132, 100, $white, $font, 'Found-U');
            $lines = self::lines($title !== '' ? $title : 'Found-U', 22, 4);
            $y = 230;
            foreach ($lines as $line) {
                imagettftext($image, 54, 0, 64, $y, $white, $font, $line);
                $y += 72;
            }
            $sub = self::lines($subtitle, 36, 2);
            $y = 520;
            foreach ($sub as $line) {
                imagettftext($image, 26, 0, 64, $y, $muted, $font, $line);
                $y += 40;
            }
        } else {
            imagestring($image, 5, 132, 78, 'Found-U', $white);
            imagestring($image, 5, 64, 220, 'Found-U', $white);
        }
        ob_start();
        imagepng($image);
        $bytes = ob_get_clean();
        imagedestroy($image);
        return is_string($bytes) && $bytes !== '' ? $bytes : self::fallback();
    }

    public static function font(string $appRoot): string
    {
        return $appRoot . '/resources/fonts/Sarabun-Regular.ttf';
    }

    public static function prune(string $appRoot, int $now): int
    {
        $dir = $appRoot . '/storage/cache/og';
        if (!is_dir($dir)) {
            return 0;
        }
        $removed = 0;
        $paths = glob($dir . '/*.png');
        if (!is_array($paths)) {
            return 0;
        }
        foreach ($paths as $path) {
            if ($removed >= 50) {
                break;
            }
            $mtime = filemtime($path);
            if ($mtime !== false && $mtime < $now - 14 * 86400) {
                if (@unlink($path)) {
                    $removed++;
                }
            }
        }
        return $removed;
    }

    private static function lines(string $text, int $size, int $max): array
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        if ($text === '') {
            return [];
        }
        $lines = [];
        while ($text !== '' && count($lines) < $max) {
            if (mb_strlen($text) <= $size) {
                $lines[] = $text;
                break;
            }
            $chunk = mb_substr($text, 0, $size);
            $space = mb_strrpos($chunk, ' ');
            if ($space !== false && $space > 8) {
                $chunk = mb_substr($chunk, 0, $space);
            }
            $lines[] = $chunk;
            $text = trim(mb_substr($text, mb_strlen($chunk)));
        }
        if ($text !== '' && $lines !== []) {
            $last = $lines[count($lines) - 1];
            $lines[count($lines) - 1] = mb_substr($last, 0, max(1, $size - 1)) . '…';
        }
        return $lines;
    }

    private static function writeTemp(string $bytes): string
    {
        $path = tempnam(sys_get_temp_dir(), 'og');
        if ($path === false) {
            throw new \RuntimeException('og temp file');
        }
        file_put_contents($path, $bytes);
        return $path;
    }

    private static function fallback(): string
    {
        return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') ?: '';
    }
}
