<?php

declare(strict_types=1);

namespace Foundu\Cron;

use RuntimeException;

// Weekly refresh of the Cloudflare IP ranges. The same list is the
// Require ip block in public_html/.htaccess and the file ClientIp loads.
// A bad download is ignored. The live files are replaced only after the
// new copy parses back to the same ranges.
final class CloudflareList
{
    public const V4 = 'https://www.cloudflare.com/ips-v4';
    public const V6 = 'https://www.cloudflare.com/ips-v6';

    public static function due(string $stampPath, int $now): bool
    {
        if (!is_file($stampPath)) {
            return true;
        }
        $raw = trim((string) file_get_contents($stampPath));
        if (preg_match('/^\d+$/', $raw) !== 1) {
            return true;
        }
        return $now - (int) $raw >= 7 * 86400;
    }

    public static function refresh(string $htaccess, string $phpFile, string $stampPath, int $now, ?callable $fetch = null): string
    {
        $fetch ??= self::http(...);
        $v4 = self::parse((string) $fetch(self::V4), false);
        $v6 = self::parse((string) $fetch(self::V6), true);
        if (count($v4) < 4 || count($v6) < 3 || count($v4) > 80 || count($v6) > 80) {
            throw new RuntimeException('cloudflare list failed validation');
        }
        self::install($htaccess, $phpFile, $v4, $v6, $now);
        $dir = dirname($stampPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        file_put_contents($stampPath, (string) $now);
        return 'cf-ips ' . (count($v4) + count($v6));
    }

    public static function install(string $htaccess, string $phpFile, array $v4, array $v6, int $now): void
    {
        foreach (array_merge($v4, $v6) as $cidr) {
            if (!self::cidr($cidr)) {
                throw new RuntimeException('cloudflare list failed validation');
            }
        }
        self::writePhp($phpFile, $v4, $v6, $now);
        self::writeHtaccess($htaccess, array_merge($v4, $v6));
    }

    public static function cidr(string $value): bool
    {
        $slash = strpos($value, '/');
        if ($slash === false) {
            return false;
        }
        $ip = substr($value, 0, $slash);
        $bits = substr($value, $slash + 1);
        if (preg_match('/^\d+$/', $bits) !== 1) {
            return false;
        }
        $prefix = (int) $bits;
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            return $prefix >= 8 && $prefix <= 32;
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) {
            return $prefix >= 16 && $prefix <= 128;
        }
        return false;
    }

    private static function parse(string $body, bool $v6): array
    {
        $ranges = [];
        foreach (preg_split('/\R/', $body) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!self::cidr($line)) {
                throw new RuntimeException('cloudflare list failed validation');
            }
            $isV6 = str_contains($line, ':');
            if ($isV6 !== $v6) {
                throw new RuntimeException('cloudflare list failed validation');
            }
            $ranges[] = $line;
        }
        return array_values(array_unique($ranges));
    }

    private static function writePhp(string $path, array $v4, array $v6, int $now): void
    {
        $export = var_export(['v4' => array_values($v4), 'v6' => array_values($v6)], true);
        $php = "<?php\n\n// Snapshot of https://www.cloudflare.com/ips-v4 and ips-v6.\n"
            . '// Refreshed ' . gmdate('Y-m-d', $now) . " by bin/cron.php.\n"
            . "// Keep this list equal to the Require ip lines in public_html/.htaccess.\n\nreturn {$export};\n";
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $php) === false) {
            throw new RuntimeException('could not write cloudflare ip list');
        }
        $loaded = require $tmp;
        $got = array_values(array_merge($loaded['v4'] ?? [], $loaded['v6'] ?? []));
        if ($got !== array_values(array_merge($v4, $v6))) {
            @unlink($tmp);
            throw new RuntimeException('cloudflare php list failed validation');
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('could not replace cloudflare ip list');
        }
        if (function_exists('opcache_invalidate')) {
            opcache_invalidate($path, true);
        }
    }

    private static function writeHtaccess(string $path, array $ranges): void
    {
        $text = file_get_contents($path);
        if (!is_string($text) || !str_contains($text, '# BEGIN foundu-cloudflare-ips') || !str_contains($text, '# END foundu-cloudflare-ips')) {
            throw new RuntimeException('htaccess is missing the cloudflare markers');
        }
        $block = "    # BEGIN foundu-cloudflare-ips\n";
        foreach ($ranges as $cidr) {
            $block .= '    Require ip ' . $cidr . "\n";
        }
        $block .= '    # END foundu-cloudflare-ips';
        $next = preg_replace(
            '/[ \t]*# BEGIN foundu-cloudflare-ips\R.*?[ \t]*# END foundu-cloudflare-ips/s',
            $block,
            $text,
            1,
            $count
        );
        if (!is_string($next) || $count !== 1 || !str_contains($next, 'RewriteRule ^api')) {
            throw new RuntimeException('htaccess rewrite was not left intact');
        }
        preg_match_all('/^\s*Require\s+ip\s+(\S+)\s*$/m', $next, $matches);
        $found = $matches[1];
        $expect = $ranges;
        sort($found);
        sort($expect);
        if ($found !== $expect) {
            throw new RuntimeException('htaccess ip list failed validation');
        }
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $next) === false) {
            throw new RuntimeException('could not write htaccess');
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('could not replace htaccess');
        }
    }

    private static function http(string $url): string
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl is not available');
        }
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('curl failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'Found-U-cron',
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (!is_string($raw) || $code !== 200 || strlen($raw) > 65536) {
            throw new RuntimeException('cloudflare list download failed');
        }
        return $raw;
    }
}
