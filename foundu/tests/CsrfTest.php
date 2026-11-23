<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\SessionRecord;
use Foundu\Http\Attrs;
use Foundu\Http\CookieQueue;
use Foundu\Http\CsrfMiddleware;
use Foundu\Http\HttpError;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response;

final class CsrfTest extends TestCase
{
    public function testMutationNeedsHeaderCookieAndSession(): void
    {
        $session = $this->session('abc');
        $ok = new class implements RequestHandlerInterface {
            public int $calls = 0;
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->calls++;
                return new Response();
            }
        };

        $this->assertSame(403, $this->dispatch('POST', $session, null, null));
        $this->assertSame(403, $this->dispatch('POST', $session, 'abc', null));
        $this->assertSame(403, $this->dispatch('POST', $session, 'zzz', 'zzz'));
        $this->assertSame(200, $this->dispatch('POST', $session, 'abc', 'abc', $ok));
        $this->assertSame(1, $ok->calls);
    }

    public function testGetAndGuestsSkipTheCheck(): void
    {
        $session = $this->session('abc');
        $this->assertSame(200, $this->dispatch('GET', $session, null, null));
        $this->assertSame(200, $this->dispatch('POST', null, null, null));
    }

    private function dispatch(
        string $method,
        ?SessionRecord $session,
        ?string $cookie,
        ?string $header,
        ?RequestHandlerInterface $handler = null,
    ): int {
        $handler ??= new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new Response();
            }
        };
        try {
            return $this->middleware()->process($this->request($method, $session, $cookie, $header), $handler)->getStatusCode();
        } catch (HttpError $error) {
            return $error->status;
        }
    }

    private function middleware(): CsrfMiddleware
    {
        return new CsrfMiddleware(['APP_URL' => 'https://school.example']);
    }

    private function request(string $method, ?SessionRecord $session, ?string $cookie, ?string $header): ServerRequestInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://school.example/api/items');
        $request = $request->withAttribute(Attrs::SESSION, $session);
        $cookies = [];
        if ($cookie !== null) {
            $cookies['__Host-foundu-csrf'] = $cookie;
        }
        $request = $request->withCookieParams($cookies);
        if ($header !== null) {
            $request = $request->withHeader('X-CSRF-Token', $header);
        }
        $request = $request->withAttribute(Attrs::COOKIES, new CookieQueue());
        return $request;
    }

    private function session(string $csrf): SessionRecord
    {
        return new SessionRecord('id', 'account', $csrf, 1_700_000_000, 1_700_001_000, null);
    }
}
