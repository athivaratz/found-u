<?php

declare(strict_types=1);

namespace Foundu;

use Foundu\Http\Health;
use Foundu\Http\Json;
use Foundu\Http\PrivateNoStore;
use PDOException;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Factory\AppFactory;
use Slim\App;
use Throwable;

final class Kernel
{
    public static function create(string $appRoot): App
    {
        $app = AppFactory::create();
        $app->setBasePath('/api');

        // P3 fills this in, cheapest rejection first:
        // real IP, IP rate limit (APCu, else storage/cache, else MariaDB),
        // route + DB session, per-account limits, login lockout, Turnstile,
        // AI semaphore, body size. No Redis and no background worker.
        $app->add(new PrivateNoStore());
        $app->addRoutingMiddleware();

        $errors = $app->addErrorMiddleware(false, true, true);
        $errors->setDefaultErrorHandler(function (
            ServerRequestInterface $request,
            Throwable $exception
        ) use ($app) {
            $status = 500;
            $error = 'server_error';
            if ($exception instanceof HttpException) {
                $status = $exception->getCode() >= 400 ? $exception->getCode() : 500;
                $error = $status === 404 ? 'not_found' : ($status === 405 ? 'method_not_allowed' : 'http_error');
            }
            if ($exception instanceof PDOException) {
                Log::get()->error('database error', ['sqlstate' => (string) $exception->getCode()]);
            } elseif ($status >= 500) {
                Log::get()->error($exception->getMessage(), ['type' => $exception::class]);
            }
            return Json::write($app->getResponseFactory()->createResponse(), $status, [
                'ok' => false,
                'error' => $error,
            ]);
        });

        $app->get('/health', static function ($request, $response) use ($appRoot) {
            return Health::respond($appRoot, $request, $response);
        });
        $app->get('/health/', static function ($request, $response) use ($appRoot) {
            return Health::respond($appRoot, $request, $response);
        });

        return $app;
    }
}
