<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Psr\Http\Message\ServerRequestInterface;

final class Gate
{
    public static function actor(ServerRequestInterface $request): Actor
    {
        $actor = $request->getAttribute(Attrs::ACTOR);
        return $actor instanceof Actor ? $actor : Actor::guest();
    }

    public static function demand(string $table, string $op, Actor $actor, array $row = []): void
    {
        if (Authz::permits($table, $op, $actor, $row)) {
            return;
        }
        if ($actor->isGuest()) {
            throw new HttpError(401, 'unauthorized');
        }
        throw new HttpError(403, 'forbidden');
    }

    public static function db(\Closure $pdo): \PDO
    {
        $db = $pdo();
        if (!$db instanceof \PDO) {
            throw new HttpError(503, 'server_error');
        }
        return $db;
    }
}
