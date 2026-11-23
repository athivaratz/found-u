<?php

declare(strict_types=1);

namespace Foundu\Match;

use Foundu\Ai\Budget;
use Foundu\Ai\Credentials;
use Foundu\Ai\Generate;
use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Data\Gate;
use Foundu\Data\Reply;
use Foundu\Data\Settings;
use Foundu\Data\Site;
use Foundu\Data\Values;
use Foundu\Http\Attrs;
use Foundu\Http\ClientAddress;
use Foundu\Http\HttpError;
use Foundu\RateLimit\Limiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

final class Routes
{
    public static function register(App $app, array $config, \Closure $pdo): void
    {
        $budget = Budget::fromConfig($config);
        $limiter = Limiter::open();
        $app->post('/match', static function ($request, $response) use ($pdo, $config, $budget, $limiter) {
            return self::one($request, $response, Gate::db($pdo), $config, $budget, $limiter);
        });
        $app->get('/match/batch', static function ($request, $response) use ($pdo, $config, $budget, $limiter) {
            return self::batch($request, $response, Gate::db($pdo), $config, $budget, $limiter, true);
        });
        $app->post('/match/batch', static function ($request, $response) use ($pdo, $config, $budget, $limiter) {
            return self::batch($request, $response, Gate::db($pdo), $config, $budget, $limiter, false);
        });
        $app->post('/match/confirm', static function ($request, $response) use ($pdo) {
            return self::mutate($request, $response, Gate::db($pdo), 'confirm');
        });
        $app->post('/match/unmatch', static function ($request, $response) use ($pdo) {
            return self::mutate($request, $response, Gate::db($pdo), 'unmatch');
        });
        $app->post('/match/reject', static function ($request, $response) use ($pdo) {
            return self::mutate($request, $response, Gate::db($pdo), 'reject');
        });
    }

    private static function one(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
        Limiter $limiter,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        self::pace($request, $pdo, $limiter, $actor, 30);
        $body = self::body($request);
        $type = (string) ($body['type'] ?? '');
        if ($type !== 'lost' && $type !== 'found') {
            throw new HttpError(400, 'invalid_input', ['field' => 'type']);
        }
        $itemId = Values::uuid($body['itemId'] ?? null, 'itemId', true);
        $useAI = ($body['useAI'] ?? false) === true;
        Site::expireRows($pdo);
        $settings = Settings::read($pdo);
        $token = null;
        try {
            if ($useAI) {
                Authz::requireRole($actor, Actor::USER);
                @set_time_limit(26);
                $token = $budget->lease($pdo, $actor->accountId, time());
                $budget->charge($pdo, $actor, 'match', $settings, false, time());
            }
            $matches = Suggest::one(
                $pdo,
                $type,
                (string) $itemId,
                $useAI,
                $useAI ? Generate::fromConfig($config) : null,
                $useAI ? Credentials::load($pdo, $config) : null,
                $settings
            );
        } finally {
            if (is_string($token)) {
                $budget->release($pdo, $token);
            }
        }
        return Reply::json($response, 200, [
            'matches' => $matches,
            'total' => count($matches),
            'useAI' => $useAI,
        ]);
    }

    private static function batch(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
        Limiter $limiter,
        bool $get,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::ADMIN);
        self::pace($request, $pdo, $limiter, $actor, 10);
        $query = $request->getQueryParams();
        $body = $get ? [] : self::body($request);
        $useAI = $get
            ? (($query['useAI'] ?? '') === 'true' || ($query['useAI'] ?? '') === '1')
            : (($body['useAI'] ?? false) === true);
        $includeHistory = $get || !array_key_exists('includeHistory', $body) || $body['includeHistory'] !== false;
        Site::expireRows($pdo);
        $settings = Settings::read($pdo);
        $token = null;
        try {
            if ($useAI) {
                @set_time_limit(26);
                $token = $budget->lease($pdo, $actor->accountId, time());
                $budget->charge($pdo, $actor, 'match', $settings, false, time());
            }
            $result = Suggest::batch(
                $pdo,
                $useAI,
                $useAI ? Generate::fromConfig($config) : null,
                $useAI ? Credentials::load($pdo, $config) : null,
                $settings
            );
        } finally {
            if (is_string($token)) {
                $budget->release($pdo, $token);
            }
        }
        return Reply::json($response, 200, [
            'matches' => $result['matches'],
            'total' => count($result['matches']),
            'pool' => $result['pool'],
            'useAI' => $useAI,
            'history' => $includeHistory ? Store::history($pdo) : [],
        ]);
    }

    private static function mutate(ServerRequestInterface $request, ResponseInterface $response, \PDO $pdo, string $op): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::ADMIN);
        $body = self::body($request);
        $lostId = (string) Values::uuid($body['lostId'] ?? null, 'lostId', true);
        $foundId = (string) Values::uuid($body['foundId'] ?? null, 'foundId', true);
        if ($op === 'confirm') {
            Store::confirm($pdo, $lostId, $foundId);
            return Reply::json($response, 200, [
                'ok' => true,
                'lostId' => $lostId,
                'foundId' => $foundId,
                'lostStatus' => 'found',
                'foundStatus' => 'found',
            ]);
        }
        if ($op === 'unmatch') {
            Store::unmatch($pdo, $lostId, $foundId);
            return Reply::json($response, 200, [
                'ok' => true,
                'lostId' => $lostId,
                'foundId' => $foundId,
                'lostStatus' => 'searching',
                'foundStatus' => 'found',
            ]);
        }
        Store::reject($pdo, $lostId, $foundId, $actor->accountId);
        return Reply::json($response, 200, ['ok' => true, 'lostId' => $lostId, 'foundId' => $foundId]);
    }

    private static function pace(ServerRequestInterface $request, \PDO $pdo, Limiter $limiter, Actor $actor, int $limit): void
    {
        $client = $request->getAttribute(Attrs::CLIENT);
        $ip = $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
        $subject = $actor->accountId ?? $ip;
        $decision = $limiter->hit($pdo, 'account_match', $subject, $limit, 60, time());
        if (!$decision->allowed) {
            throw HttpError::tooMany($decision->retryAfter);
        }
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }
}
