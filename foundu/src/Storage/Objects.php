<?php

declare(strict_types=1);

namespace Foundu\Storage;

use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Data\Gate;
use Foundu\Data\Reply;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Foundu\Log;
use Foundu\RateLimit\Buckets;
use Foundu\RateLimit\Limiter;
use Foundu\Validation\Input;
use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// Presigned R2 URLs. PHP never reads the file. The browser PUTs and
// DELETEs the object itself. There is no anonymous upload: a guest is
// 401 before a URL is minted, so Turnstile is not asked. If a later
// route allows a guest to upload, it has to call Turnstile first.
//
// Ownership lives in two places that must agree. The key is
// {prefix}/{accountId}/{random}.{ext}, and storage_objects stores the
// same account id. Delete is allowed for that account or an admin.
// The client does not choose the key.
final class Objects
{
    public const PUT_TTL = 300;
    public const DELETE_TTL = 120;
    public const MAX_BYTES = 10485760;
    public const EDITOR_MAX_BYTES = 5242880;

    private const TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    private const PREFIX = [
        'avatar' => 'avatars',
        'found' => 'found-items',
        'blog' => 'blog',
        'help' => 'help',
        'branding' => 'branding',
    ];

    private const KEY = '/^(avatars|found-items|blog|help|branding)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\.(jpg|png|webp|gif)$/';

    public static function register(App $app, array $config, \Closure $pdo, Limiter $limiter): void
    {
        $app->post('/storage/upload', static function ($request, $response) use ($config, $pdo, $limiter) {
            return self::presign($request, $response, $config, Gate::db($pdo), $limiter, null);
        });
        $app->post('/storage/delete', static function ($request, $response) use ($config, $pdo) {
            return self::remove($request, $response, $config, Gate::db($pdo));
        });
        $app->post('/admin/blog/upload', static function ($request, $response) use ($config, $pdo, $limiter) {
            return self::presign($request, $response, $config, Gate::db($pdo), $limiter, 'blog');
        });
        $app->post('/admin/help/upload', static function ($request, $response) use ($config, $pdo, $limiter) {
            return self::presign($request, $response, $config, Gate::db($pdo), $limiter, 'help');
        });
    }

    private static function presign(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $config,
        PDO $pdo,
        Limiter $limiter,
        ?string $forced,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        $body = Input::object($request->getAttribute(Attrs::JSON));
        $allowed = $forced === null ? ['avatar', 'found', 'branding'] : [$forced];
        $purpose = $forced ?? Input::enum($body, 'purpose', $allowed);
        if (!isset(self::PREFIX[$purpose]) || !in_array($purpose, $allowed, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'purpose']);
        }
        $role = in_array($purpose, ['blog', 'help', 'branding'], true) ? Actor::ADMIN : Actor::USER;
        Authz::requireRole($actor, $role);
        $accountId = $actor->accountId;
        if ($accountId === null || $accountId === '') {
            throw new HttpError(401, 'unauthorized');
        }

        $type = Input::enum($body, 'contentType', array_keys(self::TYPES));
        $max = in_array($purpose, ['blog', 'help'], true) ? self::EDITOR_MAX_BYTES : self::MAX_BYTES;
        $bytes = Input::int($body, 'contentLength', 1, $max);
        $endpoint = self::endpoint($config);
        self::limit($config, $pdo, $limiter, $accountId);
        $key = self::allocate($pdo, $purpose, $accountId, self::TYPES[$type], $type, $bytes);
        $uri = SigV4::encodePath('/' . $endpoint['bucket'] . '/' . $key);
        $amz = gmdate('Ymd\THis\Z');
        $query = SigV4::presign(
            'PUT',
            $endpoint['host'],
            $uri,
            $endpoint['access'],
            $endpoint['secret'],
            $endpoint['region'],
            [
                'content-type' => $type,
                'content-length' => (string) $bytes,
            ],
            self::PUT_TTL,
            $amz
        );

        return Reply::json($response, 200, [
            'uploadUrl' => $endpoint['origin'] . $uri . '?' . $query,
            'publicUrl' => $endpoint['public'] . '/' . $key,
            'path' => $key,
            'backend' => 'r2',
            'contentType' => $type,
            'contentLength' => $bytes,
        ]);
    }

    private static function remove(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $config,
        PDO $pdo,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $body = Input::object($request->getAttribute(Attrs::JSON));
        $endpoint = self::endpoint($config);
        $key = self::keyFrom($body, $endpoint['public']);
        $row = Database::run(
            $pdo,
            'SELECT object_key, account_id FROM storage_objects WHERE object_key = ? LIMIT 1',
            [$key]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        $owner = strtolower((string) $row['account_id']);
        $inKey = explode('/', $key)[1] ?? '';
        $actorId = strtolower((string) $actor->accountId);
        if (strlen($owner) !== strlen($inKey) || !hash_equals($owner, $inKey)) {
            throw new HttpError(403, 'forbidden');
        }
        $mine = $actorId !== '' && strlen($owner) === strlen($actorId) && hash_equals($owner, $actorId);
        if (!$mine && !$actor->isAdmin()) {
            throw new HttpError(403, 'forbidden');
        }

        $uri = SigV4::encodePath('/' . $endpoint['bucket'] . '/' . $key);
        $amz = gmdate('Ymd\THis\Z');
        $query = SigV4::presign(
            'DELETE',
            $endpoint['host'],
            $uri,
            $endpoint['access'],
            $endpoint['secret'],
            $endpoint['region'],
            [],
            self::DELETE_TTL,
            $amz
        );

        return Reply::json($response, 200, [
            'success' => true,
            'deleteUrl' => $endpoint['origin'] . $uri . '?' . $query,
            'path' => $key,
        ]);
    }

    private static function limit(array $config, PDO $pdo, Limiter $limiter, string $accountId): void
    {
        [$scope, $limit, $window] = Buckets::presign($config);
        $decision = $limiter->hit($pdo, $scope, $accountId, $limit, $window, time());
        if (!$decision->allowed) {
            throw HttpError::tooMany($decision->retryAfter);
        }
    }

    private static function allocate(
        PDO $pdo,
        string $purpose,
        string $accountId,
        string $ext,
        string $type,
        int $bytes,
    ): string {
        $prefix = self::PREFIX[$purpose];
        for ($try = 0; $try < 2; $try++) {
            $key = $prefix . '/' . $accountId . '/' . bin2hex(random_bytes(16)) . '.' . $ext;
            try {
                Database::run(
                    $pdo,
                    'INSERT INTO storage_objects (object_key, account_id, purpose, content_type, bytes)
                     VALUES (?, ?, ?, ?, ?)',
                    [$key, $accountId, $purpose, $type, $bytes]
                );
                return $key;
            } catch (PDOException $e) {
                $state = (string) ($e->errorInfo[0] ?? '');
                if ($state === '23000' && $try === 0) {
                    continue;
                }
                Log::get()->error('storage insert failed', ['sqlstate' => $state]);
                throw new HttpError(500, 'server_error');
            }
        }
        throw new HttpError(500, 'server_error');
    }

    private static function keyFrom(array $body, string $publicBase): string
    {
        $path = Input::optionalString($body, 'path', 512);
        $url = Input::optionalString($body, 'url', 2048);
        if ($path !== null) {
            $key = $path;
        } elseif ($url !== null) {
            $prefix = $publicBase . '/';
            if (!str_starts_with($url, $prefix) || str_contains($url, '?') || str_contains($url, '#')) {
                throw new HttpError(400, 'invalid_input', ['field' => 'url']);
            }
            $key = rawurldecode(substr($url, strlen($prefix)));
        } else {
            throw new HttpError(400, 'invalid_input', ['field' => 'path']);
        }
        if (preg_match(self::KEY, $key) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'path']);
        }
        return $key;
    }

    private static function endpoint(array $config): array
    {
        $local = (string) ($config['APP_ENV'] ?? 'production') === 'local';
        $bucket = self::token((string) ($config['R2_BUCKET_NAME'] ?? ''), '/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/');
        $access = self::token((string) ($config['R2_ACCESS_KEY_ID'] ?? ''), '/^[A-Za-z0-9]{3,128}$/');
        $secret = (string) ($config['R2_SECRET_ACCESS_KEY'] ?? '');
        if (preg_match('/^[\x21-\x7e]{8,128}$/', $secret) !== 1) {
            throw new HttpError(503, 'storage_unconfigured');
        }
        $region = trim((string) ($config['R2_REGION'] ?? ''));
        if ($region === '') {
            $region = 'auto';
        }
        if (preg_match('/^[a-z0-9-]{1,32}$/', $region) !== 1) {
            throw new HttpError(503, 'storage_unconfigured');
        }

        $endpoint = rtrim(trim((string) ($config['R2_ENDPOINT'] ?? '')), '/');
        if ($endpoint === '') {
            $account = self::token((string) ($config['R2_ACCOUNT_ID'] ?? ''), '/^[A-Za-z0-9]{1,64}$/');
            $endpoint = 'https://' . $account . '.r2.cloudflarestorage.com';
        }
        $api = self::origin($endpoint, $local);
        $public = self::origin(rtrim(trim((string) ($config['R2_PUBLIC_BASE_URL'] ?? '')), '/'), $local);

        return [
            'origin' => $api['origin'],
            'host' => $api['host'],
            'public' => $public['origin'],
            'bucket' => $bucket,
            'access' => $access,
            'secret' => $secret,
            'region' => $region,
        ];
    }

    private static function origin(string $url, bool $local): array
    {
        $parts = parse_url($url);
        if (!is_array($parts)) {
            throw new HttpError(503, 'storage_unconfigured');
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');
        if ($host === '' || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw new HttpError(503, 'storage_unconfigured');
        }
        if (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/') {
            throw new HttpError(503, 'storage_unconfigured');
        }
        $https = $scheme === 'https';
        if (!$https && !($local && $scheme === 'http')) {
            throw new HttpError(503, 'storage_unconfigured');
        }
        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        $default = ($https && $port === 443) || (!$https && $port === 80);
        $hostHeader = $host;
        $origin = $scheme . '://' . $host;
        if ($port !== null && !$default) {
            $hostHeader .= ':' . $port;
            $origin .= ':' . $port;
        }
        return ['origin' => $origin, 'host' => $hostHeader];
    }

    private static function token(string $value, string $pattern): string
    {
        $value = trim($value);
        if (preg_match($pattern, $value) !== 1) {
            throw new HttpError(503, 'storage_unconfigured');
        }
        return $value;
    }
}
