<?php

declare(strict_types=1);

namespace Foundu\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ClientIp implements MiddlewareInterface
{
    public function __construct(
        private readonly string $appEnv,
        private readonly bool $mock,
        private readonly array $ranges,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        Path::normalize($request);
        $client = ClientAddress::resolve($request->getServerParams(), $this->appEnv, $this->mock, $this->ranges);
        return $handler->handle($request->withAttribute(Attrs::CLIENT, $client));
    }
}
