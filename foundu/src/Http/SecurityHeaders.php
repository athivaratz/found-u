<?php

declare(strict_types=1);

namespace Foundu\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// API responses set these themselves. Apache still sends the page policy
// from .htaccess; a JSON response should not depend on that module.
// Cache-Control is left alone when a route already set it, so a later
// public endpoint can send s-maxage without this layer wiping it.
final class SecurityHeaders implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);
        return self::apply($response);
    }

    public static function apply(ResponseInterface $response): ResponseInterface
    {
        $headers = [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Cross-Origin-Opener-Policy' => 'same-origin',
            'Cross-Origin-Resource-Policy' => 'same-origin',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            'X-Robots-Tag' => 'noindex',
        ];
        foreach ($headers as $name => $value) {
            $response = $response->withHeader($name, $value);
        }
        if (!$response->hasHeader('Cache-Control')) {
            $response = $response->withHeader('Cache-Control', 'private, no-store');
        }
        return $response;
    }
}
