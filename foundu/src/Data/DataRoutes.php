<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\SessionService;
use Foundu\RateLimit\Limiter;
use Slim\App;

final class DataRoutes
{
    public static function register(App $app, array $config, \Closure $pdo, SessionService $sessions, string $appRoot): void
    {
        $limiter = Limiter::open();
        Items::register($app, $pdo, $limiter);
        Catalog::register($app, $pdo);
        People::register($app, $config, $pdo, $sessions);
        Logs::register($app, $pdo);
        Site::register($app, $pdo, $appRoot, $limiter);
    }
}
