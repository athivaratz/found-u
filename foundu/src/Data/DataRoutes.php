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
        Usage::register($app, $pdo);
        Cms::register($app, $pdo);
        Nfc::register($app, $config, $pdo, $limiter);
        Geocode::register($app, $config, $pdo, $limiter);
        Site::register($app, $pdo, $appRoot, $limiter, $config);
    }
}
