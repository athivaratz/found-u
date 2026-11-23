<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\Authz;
use Foundu\Database;
use Foundu\Http\HttpError;
use Foundu\Ids;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// The old place search called Nominatim with countrycodes=th.
// One process-wide timestamp cannot be shared across PHP workers, so the
// one-request-per-two-seconds cap lives in rate_limits. Results are cached
// for a week. GEOCODE_USER_AGENT in .env.php is the contact Nominatim asks for.
final class Geocode
{
    public const UPSTREAM = 'https://nominatim.openstreetmap.org/search';

    public static ?\Closure $fetch = null;

    public static function register(App $app, array $config, \Closure $pdo, Limiter $limiter): void
    {
        $app->get('/geocode/search', static function ($request, $response) use ($config, $pdo, $limiter) {
            return self::search($request, $response, Gate::db($pdo), $config, $limiter);
        });
    }

    public static function search(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, array $config, Limiter $limiter): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, 'admin');
        $query = trim((string) ($request->getQueryParams()['q'] ?? ''));
        if (mb_strlen($query) < 2) {
            return Reply::json($response, 200, ['results' => []]);
        }
        if (mb_strlen($query) > 120) {
            throw new HttpError(400, 'invalid_input', ['field' => 'q']);
        }
        $normal = self::normal($query);
        $hash = hash('sha256', $normal);
        $cached = self::cached($pdo, $hash);
        $adminLimit = $limiter->hit($pdo, 'geocode_admin', (string) $actor->accountId, 30, 60, time());
        if (!$adminLimit->allowed) {
            throw self::tooMany($adminLimit->retryAfter);
        }
        if ($cached !== null && $cached['fresh']) {
            return Reply::json($response, 200, ['results' => $cached['results']]);
        }
        $upstream = $limiter->hit($pdo, 'geocode_upstream', 'nominatim', 1, 2, time());
        if (!$upstream->allowed) {
            throw self::tooMany($upstream->retryAfter);
        }
        try {
            $results = self::upstream($config, $query);
        } catch (HttpError $e) {
            if ($cached !== null) {
                return Reply::json($response, 200, ['results' => $cached['results']]);
            }
            throw $e;
        }
        self::store($pdo, $hash, $normal, $results);
        return Reply::json($response, 200, ['results' => $results]);
    }

    private static function upstream(array $config, string $query): array
    {
        $endpoint = (string) ($config['GEOCODE_ENDPOINT'] ?? '');
        if ($endpoint === '') {
            $endpoint = self::UPSTREAM;
        }
        $parts = parse_url($endpoint);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || !isset($parts['host'])) {
            throw new HttpError(502, 'Geocoding service unavailable');
        }
        $ua = trim((string) ($config['GEOCODE_USER_AGENT'] ?? ''));
        if ($ua === '') {
            $origin = trim((string) ($config['APP_URL'] ?? ''));
            $ua = 'Found-U (' . ($origin !== '' ? $origin : 'school lost-and-found') . ')';
        }
        if (strlen($ua) > 200) {
            $ua = substr($ua, 0, 200);
        }
        $params = [
            'q' => $query,
            'format' => 'json',
            'limit' => '6',
            'countrycodes' => 'th',
            'addressdetails' => '0',
        ];
        $key = trim((string) ($config['GEOCODE_API_KEY'] ?? ''));
        $host = strtolower((string) $parts['host']);
        if ($key !== '' && $host !== 'nominatim.openstreetmap.org') {
            $params['key'] = $key;
        }
        $url = $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . http_build_query($params);
        $raw = self::fetch($url, $ua, 8);
        try {
            $decoded = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpError(502, 'Geocoding service unavailable');
        }
        if (!is_array($decoded)) {
            throw new HttpError(502, 'Geocoding service unavailable');
        }
        $results = [];
        foreach ($decoded as $item) {
            if (!is_array($item) || count($results) >= 6) {
                continue;
            }
            $lat = self::coord($item['lat'] ?? null, -90, 90);
            $lng = self::coord($item['lon'] ?? null, -180, 180);
            $label = $item['display_name'] ?? '';
            if ($lat === null || $lng === null || !is_string($label) || $label === '') {
                continue;
            }
            $id = $item['place_id'] ?? '';
            if (!is_scalar($id) || (string) $id === '') {
                continue;
            }
            $results[] = [
                'id' => (string) $id,
                'label' => mb_substr($label, 0, 300),
                'lat' => $lat,
                'lng' => $lng,
            ];
        }
        return $results;
    }

    public static function fetch(string $url, string $userAgent, int $timeout): string
    {
        if (self::$fetch !== null) {
            $raw = (self::$fetch)($url, $userAgent, $timeout);
            if (!is_string($raw)) {
                throw new HttpError(502, 'Geocoding request failed');
            }
            return $raw;
        }
        if (!function_exists('curl_init')) {
            throw new HttpError(502, 'Geocoding request failed');
        }
        $ch = curl_init($url);
        if ($ch === false) {
            throw new HttpError(502, 'Geocoding request failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Accept-Language: th',
                'User-Agent: ' . $userAgent,
            ],
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (!is_string($raw) || $code < 200 || $code >= 300) {
            throw new HttpError(502, $code === 0 ? 'Geocoding request failed' : 'Geocoding service unavailable');
        }
        if (strlen($raw) > 262144) {
            throw new HttpError(502, 'Geocoding service unavailable');
        }
        return $raw;
    }

    private static function cached(PDO $pdo, string $hash): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT payload, fetched_at FROM geocode_cache WHERE query_hash = ? LIMIT 1',
            [$hash]
        )->fetch();
        if (!is_array($row)) {
            return null;
        }
        $payload = Values::jsonList($row['payload'] ?? null);
        $fetched = Ids::unix((string) $row['fetched_at']);
        return [
            'results' => $payload,
            'fresh' => $fetched > 0 && (time() - $fetched) < 7 * 86400,
        ];
    }

    private static function store(PDO $pdo, string $hash, string $query, array $results): void
    {
        $json = json_encode($results, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        Database::run(
            $pdo,
            'INSERT INTO geocode_cache (query_hash, query_text, payload, fetched_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))
             ON DUPLICATE KEY UPDATE query_text = VALUES(query_text), payload = VALUES(payload), fetched_at = UTC_TIMESTAMP(3)',
            [$hash, mb_substr($query, 0, 200), $json]
        );
    }

    public static function purge(PDO $pdo, int $now): int
    {
        return Database::run(
            $pdo,
            'DELETE FROM geocode_cache WHERE fetched_at < ?',
            [Ids::utc($now - 30 * 86400)]
        )->rowCount();
    }

    private static function normal(string $query): string
    {
        $query = mb_strtolower(trim($query));
        $collapsed = preg_replace('/\s+/u', ' ', $query);
        return is_string($collapsed) ? $collapsed : $query;
    }

    private static function coord(mixed $value, float $min, float $max): ?float
    {
        if (is_int($value) || is_float($value)) {
            $number = (float) $value;
        } elseif (is_string($value) && is_numeric($value)) {
            $number = (float) $value;
        } else {
            return null;
        }
        if (!is_finite($number) || $number < $min || $number > $max) {
            return null;
        }
        return $number;
    }

    private static function tooMany(int $retryAfter): HttpError
    {
        return new HttpError(
            429,
            'Too many requests. Please wait a moment.',
            [],
            ['Retry-After' => (string) max(1, $retryAfter)]
        );
    }
}
