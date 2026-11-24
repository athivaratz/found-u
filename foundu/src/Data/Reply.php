<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class Reply
{
    public const PUBLIC_CACHE = 'public, s-maxage=60, max-age=0';
    public const PRIVATE = 'private, no-store';

    public static function json(ResponseInterface $response, int $status, array $body): ResponseInterface
    {
        return Json::write($response, $status, $body);
    }

    public static function public(ServerRequestInterface $request, ResponseInterface $response, array $body): ResponseInterface
    {
        return self::conditional($request, $response, $body, self::PUBLIC_CACHE);
    }

    public static function changes(ServerRequestInterface $request, ResponseInterface $response, array $body): ResponseInterface
    {
        return self::conditional($request, $response, $body, self::PRIVATE);
    }

    private static function conditional(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $body,
        string $cache,
    ): ResponseInterface {
        $encoded = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $etag = '"' . hash('sha256', $encoded) . '"';
        if (self::noneMatch($request, $etag)) {
            return $response
                ->withStatus(304)
                ->withHeader('ETag', $etag)
                ->withHeader('Cache-Control', $cache);
        }
        $response->getBody()->write($encoded);
        return $response
            ->withStatus(200)
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withHeader('ETag', $etag)
            ->withHeader('Cache-Control', $cache);
    }

    private static function noneMatch(ServerRequestInterface $request, string $etag): bool
    {
        $header = trim($request->getHeaderLine('If-None-Match'));
        if ($header === '') {
            return false;
        }
        if ($header === '*') {
            return true;
        }
        foreach (explode(',', $header) as $part) {
            $part = trim($part);
            if (str_starts_with($part, 'W/')) {
                $part = trim(substr($part, 2));
            }
            if ($part === $etag) {
                return true;
            }
        }
        return false;
    }
}
