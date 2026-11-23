<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Auth\SessionRecord;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Double-submit, tied to the session row.
// A cookie-authenticated mutation must send X-CSRF-Token. The header has to
// match the CSRF cookie and the csrf_token stored for that session. A site
// that can only trigger the browser cannot read the cookie, so it cannot
// set the header. Matching the row as well means a forged cookie pair is
// not enough: the attacker would also need the value the server stored.
// GET, HEAD, and OPTIONS skip this. A request with no session cookie skips
// it too, which is how login and register stay reachable.
// Origin and Sec-Fetch-Site were the other option. They break plain local
// tools and some browsers strip Origin, so the header is the check we keep.
final class CsrfMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly array $config)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $method = strtoupper($request->getMethod());
        $session = $request->getAttribute(Attrs::SESSION);
        if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) || !$session instanceof SessionRecord) {
            return $handler->handle($request);
        }

        $https = Https::requested($this->config, $request->getServerParams());
        $header = $request->getHeaderLine('X-CSRF-Token');
        $cookie = $request->getCookieParams()[SetCookie::csrfName($https)] ?? '';
        if (!is_string($cookie) || !$this->same($header, $cookie) || !$this->same($header, $session->csrf)) {
            throw new HttpError(403, 'csrf');
        }
        return $handler->handle($request);
    }

    private function same(string $left, string $right): bool
    {
        if ($left === '' || strlen($left) !== strlen($right)) {
            return false;
        }
        return hash_equals($left, $right);
    }
}
