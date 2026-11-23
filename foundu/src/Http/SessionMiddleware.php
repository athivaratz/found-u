<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Auth\Actor;
use Foundu\Auth\SessionService;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class SessionMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly array $config,
        private readonly \Closure $pdo,
        private readonly SessionService $sessions,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $https = Https::requested($this->config, $request->getServerParams());
        $queue = new CookieQueue();
        $this->sessions->bind($queue);
        $request = $request->withAttribute(Attrs::COOKIES, $queue);

        // Polling /changes every few seconds must not slide the session.
        // Opening it would rewrite expires_at about once a minute. The feed
        // is only timestamps, so this request stays a guest and does not
        // read the cookie at all.
        $skipSession = $request->getMethod() === 'GET' && Path::normalize($request) === '/changes';
        $cookies = $request->getCookieParams();
        $raw = $skipSession ? '' : ($cookies[SetCookie::sessionName($https)] ?? '');
        $via = 'cookie';
        if (!is_string($raw) || $raw === '') {
            if (!$skipSession) {
                $header = $request->getHeaderLine('Authorization');
                if (str_starts_with($header, 'Bearer ')) {
                    $raw = trim(substr($header, 7));
                    $via = 'bearer';
                }
            }
        }
        $actor = Actor::guest();
        $session = null;
        if (is_string($raw) && $raw !== '') {
            $pdo = ($this->pdo)();
            if (!$pdo instanceof PDO) {
                throw new HttpError(503, 'server_error');
            }
            $session = $this->sessions->open($pdo, $raw, time());
            if ($session === null) {
                $this->sessions->clearCookies($https);
            } elseif (is_array($session->account)) {
                $actor = Actor::fromAccount($session->account);
            }
        }

        $request = $request
            ->withAttribute(Attrs::SESSION, $session)
            ->withAttribute(Attrs::ACTOR, $actor)
            ->withAttribute(Attrs::SESSION_VIA, $session === null ? null : $via);
        $response = $handler->handle($request);
        foreach ($queue->lines as $line) {
            $response = $response->withAddedHeader('Set-Cookie', $line);
        }
        return $response;
    }
}
