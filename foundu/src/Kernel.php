<?php

declare(strict_types=1);

namespace Foundu;

use Foundu\Auth\AuthRoutes;
use Foundu\Auth\SessionService;
use Foundu\Http\BanMiddleware;
use Foundu\Http\ClientAddress;
use Foundu\Http\ClientIp;
use Foundu\Http\CsrfMiddleware;
use Foundu\Http\ErrorHandler;
use Foundu\Http\Health;
use Foundu\Http\JsonBodyMiddleware;
use Foundu\Http\RateLimitMiddleware;
use Foundu\Http\SecurityHeaders;
use Foundu\Http\SessionMiddleware;
use Foundu\RateLimit\Limiter;
use PDO;
use Slim\Factory\AppFactory;
use Slim\App;

final class Kernel
{
    public static function create(string $appRoot): App
    {
        Log::open($appRoot);
        self::warnIfPhpIsPastSupport($appRoot);
        $config = Config::load($appRoot);
        $pdo = static function () use ($config): PDO {
            return Database::connection($config);
        };
        static $released = false;
        if (!$released) {
            $released = true;
            register_shutdown_function([Database::class, 'releaseRequestState']);
        }

        $app = AppFactory::create();
        $app->setBasePath('/api');

        // First added runs closest to the route. Routing has to sit inside
        // the rate limit, or a 404 is thrown before the counter moves and a
        // scan of random paths skips it. APCu can only repeat a denial
        // MariaDB already made. The session lookup waits for a cookie.
        $sessions = SessionService::fromConfig($config);
        $app->addRoutingMiddleware();
        $app->add(new CsrfMiddleware($config));
        $app->add(new BanMiddleware($config, $pdo, $sessions));
        $app->add(new SessionMiddleware($config, $pdo, $sessions));
        $app->add(new JsonBodyMiddleware($config));
        $app->add(new RateLimitMiddleware($config, $pdo, Limiter::open()));
        $app->add(new ClientIp(
            (string) ($config['APP_ENV'] ?? 'production'),
            is_file($appRoot . '/config/mock-cf.on'),
            ClientAddress::ranges($appRoot)
        ));
        $app->add(new SecurityHeaders());

        $errors = $app->addErrorMiddleware(false, false, false);
        $errors->setDefaultErrorHandler(new ErrorHandler($config, $pdo));

        $app->get('/health', static function ($request, $response) use ($appRoot) {
            return Health::respond($appRoot, $request, $response);
        });
        $app->get('/health/', static function ($request, $response) use ($appRoot) {
            return Health::respond($appRoot, $request, $response);
        });

        AuthRoutes::register($app, $config, $pdo, $sessions);

        return $app;
    }

    private static function warnIfPhpIsPastSupport(string $appRoot): void
    {
        $warning = Platform::eolWarning();
        if (!is_string($warning)) {
            return;
        }
        $stamp = $appRoot . '/storage/logs/php-eol-warned';
        $today = gmdate('Y-m-d');
        $seen = is_file($stamp) ? trim((string) file_get_contents($stamp)) : '';
        if ($seen === $today) {
            return;
        }
        Log::get()->warning($warning);
        @file_put_contents($stamp, $today);
    }
}
