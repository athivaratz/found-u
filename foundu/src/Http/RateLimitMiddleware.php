<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Database;
use Foundu\Ids;
use Foundu\Log;
use Foundu\RateLimit\Buckets;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

final class RateLimitMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly array $config,
        private readonly \Closure $pdo,
        private readonly Limiter $limiter,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $client = $request->getAttribute(Attrs::CLIENT);
        $ip = $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
        $path = Path::normalize($request);
        [$scope, $limit, $window] = Buckets::forPath($path, $this->config);
        $pdo = ($this->pdo)();
        if (!$pdo instanceof PDO) {
            throw new HttpError(503, 'server_error');
        }
        $decision = $this->limiter->hit($pdo, $scope, $ip, $limit, $window, time());
        if (!$decision->allowed) {
            $this->sample($pdo, $scope, $ip, $decision->retryAfter);
            throw HttpError::tooMany($decision->retryAfter);
        }
        return $handler->handle($request);
    }

    private function sample(PDO $pdo, string $scope, string $ip, int $retryAfter): void
    {
        try {
            if (random_int(1, 20) !== 1) {
                return;
            }
            Database::run(
                $pdo,
                'INSERT INTO activity_logs (id, action, action_type, details, created_at) VALUES (?, ?, ?, ?, ?)',
                [
                    Ids::uuid(),
                    'rate_limited',
                    'security',
                    json_encode([
                        'scope' => $scope,
                        'ip' => $ip,
                        'retry_after' => $retryAfter,
                    ], JSON_THROW_ON_ERROR),
                    Ids::utc(time()),
                ]
            );
        } catch (Throwable $e) {
            Log::get()->warning('rate limit sample was not stored', ['type' => $e::class]);
        }
    }
}
