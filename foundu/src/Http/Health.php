<?php

declare(strict_types=1);

namespace Foundu\Http;

use DateTimeImmutable;
use DateTimeZone;
use Foundu\Cache\Store;
use Foundu\Config;
use Foundu\Database;
use Foundu\Log;
use Foundu\Platform;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

final class Health
{
    public static function respond(string $appRoot, ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $time = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
        $body = [
            'ok' => false,
            'db' => 'error',
            'php' => PHP_VERSION,
            'upload_progress' => Platform::uploadProgressEnabled() ? 'on' : 'off',
            'time' => $time,
        ];

        try {
            $store = Store::open($appRoot . '/storage/cache');
            $store->set('health', '1', 30);
            if ($store->get('health') !== '1') {
                throw new \RuntimeException('cache roundtrip failed');
            }
            $body['cache'] = $store->backend();
        } catch (Throwable $e) {
            Log::get()->error('cache check failed', ['type' => $e::class]);
            $body['cache'] = 'error';
            $body['error'] = 'cache';
            return Json::write($response, 503, $body);
        }

        try {
            $config = Config::load($appRoot);
            $version = Database::ping(Database::connection($config));
            $body['db_version'] = $version;
            if (!Platform::acceptsMariaDb($version)) {
                Log::get()->error('database version refused', ['version' => $version]);
                $body['db'] = 'old';
                $body['error'] = 'db_version';
                return Json::write($response, 503, $body);
            }
            $body['db'] = 'ok';
        } catch (PDOException $e) {
            Log::get()->error('database ping failed', ['sqlstate' => (string) $e->getCode()]);
            $body['error'] = 'db';
            return Json::write($response, 503, $body);
        }

        $mockFlag = is_file($appRoot . '/config/mock-cf.on');
        $appEnv = (string) ($config['APP_ENV'] ?? 'production');
        if ($mockFlag && $appEnv === 'local') {
            $client = ClientAddress::resolve(
                $request->getServerParams(),
                $appEnv,
                true,
                ClientAddress::ranges($appRoot)
            );
            $body['client'] = [
                'ip' => $client->ip,
                'country' => $client->country,
                'from_cloudflare' => $client->fromCloudflare,
            ];
        }

        $body['ok'] = true;
        return Json::write($response, 200, $body);
    }
}
