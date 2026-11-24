<?php

declare(strict_types=1);

namespace Foundu\Http;

use Psr\Http\Message\ServerRequestInterface;

final class Path
{
    public static function normalize(ServerRequestInterface $request): string
    {
        $path = rawurldecode($request->getUri()->getPath());
        if (str_contains($path, "\0") || str_contains($path, '\\') || str_contains($path, '..')) {
            throw new HttpError(400, 'bad_request');
        }
        if (strlen($path) > 2048) {
            throw new HttpError(400, 'bad_request');
        }
        if ($path === '/api') {
            $path = '/';
        } elseif (str_starts_with($path, '/api/')) {
            $path = substr($path, 4);
        }
        if ($path === '' || $path[0] !== '/') {
            $path = '/' . $path;
        }
        return strtolower($path);
    }
}
