<?php

declare(strict_types=1);

namespace Foundu\Http;

use Foundu\Auth\Actor;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Log;
use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Psr7\Response;
use Throwable;

// One JSON shape: {"error":"code"} plus a header when the code needs one.
// Stack traces stay in the log file and, for 5xx, in error_logs. APP_ENV=local
// may add "detail" (the exception message). It never adds the trace.
final class ErrorHandler
{
    public function __construct(
        private readonly array $config,
        private readonly \Closure $pdo,
    ) {
    }

    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails = false,
        bool $logErrors = false,
        bool $logErrorDetails = false,
    ): ResponseInterface {
        $status = 500;
        $error = 'server_error';
        $extra = [];
        $headers = [];

        if ($exception instanceof HttpError) {
            $status = $exception->status;
            $error = $exception->error;
            $extra = $exception->extra;
            $headers = $exception->headers;
        } elseif ($exception instanceof HttpException) {
            $code = $exception->getCode();
            $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 500;
            $error = match ($status) {
                404 => 'not_found',
                405 => 'method_not_allowed',
                default => 'http_error',
            };
        }

        if ($status >= 500) {
            $context = ['class' => $exception::class, 'status' => $status];
            if ($exception instanceof PDOException) {
                $context['sqlstate'] = (string) $exception->getCode();
            }
            Log::get()->error('request failed', $context);
            $this->writeRow($request, $exception);
        }

        $body = ['error' => $error];
        foreach ($extra as $key => $value) {
            if (!is_string($key) || $key === 'error' || $key === 'trace' || $key === 'stack' || $key === 'detail') {
                continue;
            }
            $body[$key] = $value;
        }
        $env = (string) ($this->config['APP_ENV'] ?? 'production');
        if ($env === 'local' && !$exception instanceof HttpError && !$exception instanceof HttpException) {
            $body['detail'] = $exception->getMessage();
        }

        $response = Json::write(new Response(), $status, $body);
        foreach ($headers as $name => $value) {
            if (is_string($name) && is_string($value)) {
                $response = $response->withHeader($name, $value);
            }
        }
        return SecurityHeaders::apply($response);
    }

    private function writeRow(ServerRequestInterface $request, Throwable $exception): void
    {
        try {
            $pdo = ($this->pdo)();
            if (!$pdo instanceof PDO) {
                return;
            }
            $actor = $request->getAttribute(Attrs::ACTOR);
            $userId = $actor instanceof Actor && is_string($actor->accountId) ? $actor->accountId : null;
            $path = substr($request->getUri()->getPath(), 0, 2048);
            $agent = substr($request->getHeaderLine('User-Agent'), 0, 512);
            $source = $exception instanceof PDOException ? 'database' : 'api';
            $stack = substr($exception->getMessage() . "\n" . $exception->getTraceAsString(), 0, 16000);
            Database::run(
                $pdo,
                'INSERT INTO error_logs (id, message, stack, severity, source, url, user_id, user_agent, metadata, created_at)
                 VALUES (?, ?, ?, \'high\', ?, ?, ?, ?, ?, ?)',
                [
                    Ids::uuid(),
                    $source . ' error',
                    $stack,
                    $source,
                    $path,
                    $userId,
                    $agent !== '' ? $agent : null,
                    json_encode(['class' => $exception::class], JSON_THROW_ON_ERROR),
                    Ids::utc(time()),
                ]
            );
        } catch (Throwable $e) {
            Log::get()->error('error log was not stored', ['class' => $e::class]);
        }
    }
}
