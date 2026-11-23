<?php

declare(strict_types=1);

namespace Foundu\Search;

use Foundu\Auth\Actor;
use Foundu\Data\Gate;
use Foundu\Data\Reply;
use Foundu\Http\HttpError;
use Slim\App;

final class Routes
{
    public static function register(App $app, array $config, \Closure $pdo): void
    {
        $app->get('/search', static function ($request, $response) use ($config, $pdo) {
            try {
                $body = Items::search(Gate::db($pdo), $config, $request->getQueryParams());
                $body = Items::redact($body, Gate::actor($request));
            } catch (HttpError $e) {
                throw $e;
            }
            return Reply::json($response, 200, $body);
        });
    }
}
