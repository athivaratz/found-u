<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Auth\Actor;
use Foundu\Auth\SessionRecord;
use Foundu\Auth\SessionService;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// A ban or a live timeout kills every session for that account, including
// the one on this request. The route still sees the session object, so
// GET /auth/banned can describe the block once. The cookie is cleared.
final class BanMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly array $config,
        private readonly \Closure $pdo,
        private readonly SessionService $sessions,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $session = $request->getAttribute(Attrs::SESSION);
        if ($session instanceof SessionRecord && is_array($session->account) && Actor::blocked($session->account, time())) {
            $accountId = $session->accountId;
            if (is_string($accountId) && $accountId !== '') {
                $pdo = ($this->pdo)();
                if ($pdo instanceof PDO) {
                    $https = Https::requested($this->config, $request->getServerParams());
                    $this->sessions->revokeAccount($pdo, $accountId, $https, time());
                }
            }
        }
        return $handler->handle($request);
    }
}
