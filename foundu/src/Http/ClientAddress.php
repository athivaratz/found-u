<?php

declare(strict_types=1);

namespace Foundu\Http;

// Real visitor IP is CF-Connecting-IP only when the TCP peer is Cloudflare.
// X-Forwarded-For is never read. Mock headers are applied only when APP_ENV
// is local and foundu/config/mock-cf.on exists, then the same rule runs.
final class ClientAddress
{
    public function __construct(
        public readonly string $ip,
        public readonly ?string $country,
        public readonly bool $fromCloudflare,
        public readonly bool $mock,
    ) {
    }

    public static function resolve(array $server, string $appEnv, bool $mockFlag, array $ranges): self
    {
        $mock = $mockFlag && $appEnv === 'local';
        if ($mock) {
            $edge = self::ip($server['HTTP_X_MOCK_CF_EDGE_IP'] ?? null);
            if ($edge !== null) {
                $server['REMOTE_ADDR'] = $edge;
            }
            if (self::header($server, 'HTTP_CF_CONNECTING_IP') === '' && isset($server['HTTP_X_MOCK_CF_CONNECTING_IP'])) {
                $server['HTTP_CF_CONNECTING_IP'] = $server['HTTP_X_MOCK_CF_CONNECTING_IP'];
            }
            if (self::header($server, 'HTTP_CF_IPCOUNTRY') === '' && isset($server['HTTP_X_MOCK_CF_IPCOUNTRY'])) {
                $server['HTTP_CF_IPCOUNTRY'] = $server['HTTP_X_MOCK_CF_IPCOUNTRY'];
            }
        }

        $remote = self::ip($server['REMOTE_ADDR'] ?? null) ?? '0.0.0.0';
        $fromCloudflare = self::inRanges($remote, $ranges);
        $ip = $remote;
        $country = null;
        if ($fromCloudflare) {
            $candidate = self::ip($server['HTTP_CF_CONNECTING_IP'] ?? null);
            if ($candidate !== null) {
                $ip = $candidate;
            }
            $country = self::country($server['HTTP_CF_IPCOUNTRY'] ?? null);
        }

        return new self($ip, $country, $fromCloudflare, $mock);
    }

    public static function ranges(string $appRoot): array
    {
        $loaded = require $appRoot . '/config/cloudflare-ips.php';
        $v4 = is_array($loaded['v4'] ?? null) ? $loaded['v4'] : [];
        $v6 = is_array($loaded['v6'] ?? null) ? $loaded['v6'] : [];
        return array_values(array_merge($v4, $v6));
    }

    private static function inRanges(string $ip, array $ranges): bool
    {
        foreach ($ranges as $cidr) {
            if (is_string($cidr) && self::inCidr($ip, $cidr)) {
                return true;
            }
        }
        return false;
    }

    private static function inCidr(string $ip, string $cidr): bool
    {
        $slash = strpos($cidr, '/');
        if ($slash === false) {
            return $ip === $cidr;
        }
        $subnet = substr($cidr, 0, $slash);
        $bits = (int) substr($cidr, $slash + 1);
        $ipBin = inet_pton($ip);
        $subBin = inet_pton($subnet);
        if ($ipBin === false || $subBin === false || strlen($ipBin) !== strlen($subBin)) {
            return false;
        }
        $max = strlen($ipBin) * 8;
        if ($bits < 0 || $bits > $max) {
            return false;
        }
        $bytes = intdiv($bits, 8);
        $rem = $bits % 8;
        if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subBin, 0, $bytes)) {
            return false;
        }
        if ($rem === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rem)) & 0xFF;
        return (ord($ipBin[$bytes]) & $mask) === (ord($subBin[$bytes]) & $mask);
    }

    private static function ip(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if (filter_var($value, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        return $value;
    }

    private static function country(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = strtoupper(trim($value));
        return preg_match('/^[A-Z]{2}$/', $value) === 1 ? $value : null;
    }

    private static function header(array $server, string $key): string
    {
        $value = $server[$key] ?? '';
        return is_string($value) ? trim($value) : '';
    }
}
