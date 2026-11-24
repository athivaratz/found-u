<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Config;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class JsonBodyMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly array $config)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $method = strtoupper($request->getMethod());
        if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return $handler->handle($request);
        }

        $path = Path::normalize($request);
        $normal = Config::int($this->config, 'BODY_MAX_BYTES', JsonBody::DEFAULT_MAX, 1024, 1048576);
        $ai = Config::int($this->config, 'BODY_MAX_AI_BYTES', JsonBody::AI_MAX, 1024, 1048576);
        $max = JsonBody::maxFor($path, $normal, $ai);

        $declared = $request->getHeaderLine('Content-Length');
        if ($declared !== '') {
            if (preg_match('/^\d+$/', $declared) !== 1) {
                throw new HttpError(400, 'bad_request');
            }
            if ((int) $declared > $max) {
                throw new HttpError(413, 'payload_too_large');
            }
        }

        $raw = (string) $request->getBody();
        if ($raw === '') {
            return $handler->handle($request->withAttribute(Attrs::JSON, null));
        }
        if (!JsonBody::accepts($request->getHeaderLine('Content-Type'))) {
            throw new HttpError(415, 'unsupported_media_type');
        }
        $decoded = JsonBody::decode($raw, $max);
        $request = $request->withAttribute(Attrs::JSON, $decoded)->withParsedBody($decoded);
        return $handler->handle($request);
    }
}
