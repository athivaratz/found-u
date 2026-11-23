<?php

declare(strict_types=1);

namespace Foundu\Agent;

use Foundu\Ai\Budget;
use Foundu\Ai\Credentials;
use Foundu\Ai\Generate;
use Foundu\Ai\Semaphore;
use Foundu\Ai\SessionPass;
use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
use Foundu\Config;
use Foundu\Data\Feed;
use Foundu\Data\Gate;
use Foundu\Data\Reply;
use Foundu\Data\Settings;
use Foundu\Http\Attrs;
use Foundu\Http\HttpError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

final class Routes
{
    public static function register(App $app, array $config, \Closure $pdo): void
    {
        $budget = Budget::fromConfig($config);
        $app->post('/agent/chat', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::chat($request, $response, Gate::db($pdo), $config, $budget);
        });
        $app->get('/agent/chat/sync', static function ($request, $response) use ($pdo) {
            return self::sync($request, $response, Gate::db($pdo));
        });
        $app->get('/admin/agent-logs', static function ($request, $response) use ($pdo) {
            $actor = Gate::actor($request);
            Gate::demand('agent_chat_logs', 'select', $actor);
            return Reply::json($response, 200, ['logs' => Journal::list(Gate::db($pdo), $request->getQueryParams())]);
        });
        $app->get('/admin/agent-logs/{id}', static function ($request, $response, array $args) use ($pdo) {
            Gate::demand('agent_chat_logs', 'select', Gate::actor($request));
            $log = Journal::one(Gate::db($pdo), (string) ($args['id'] ?? ''));
            if ($log === null) {
                throw new HttpError(404, 'Not found');
            }
            return Reply::json($response, 200, ['log' => $log]);
        });
        $app->delete('/admin/agent-logs', static function ($request, $response) use ($pdo) {
            Gate::demand('agent_chat_logs', 'delete', Gate::actor($request));
            $deleted = Journal::purge(Gate::db($pdo));
            return Reply::json($response, 200, ['deleted' => $deleted]);
        });
    }

    private static function chat(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $body = self::body($request);
        $settings = Settings::read($pdo);
        $history = self::history($body['messages'] ?? null, (int) ($settings['agentContextMaxMessages'] ?? 8));
        if ($history === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'messages']);
        }
        $wall = Config::int($config, 'AGENT_WALL_SECONDS', 25, 5, 28);
        @set_time_limit(28);
        $started = Clock::ms();
        $token = '';
        try {
            SessionPass::ensure($request, $pdo, $config, $body);
            $token = $budget->lease($pdo, $actor->accountId, time());
            $budget->charge($pdo, $actor, 'agent', $settings, false, time());
            Feed::bump($pdo, 'ai_usage');
            $facts = self::facts($body['memoryFacts'] ?? null, $actor, (int) ($settings['agentMemoryMaxFacts'] ?? 5));
            $loop = new Loop(
                $pdo,
                $actor,
                $settings,
                $config,
                Generate::fromConfig($config),
                Credentials::load($pdo, $config),
                self::coords($body['clientLocation'] ?? null),
                $actor->isAdmin() && ($body['adminLocationBypass'] ?? false) === true,
                $wall * 1000
            );
            if (!$actor->isAdmin() && ($body['adminLocationBypass'] ?? false) === true) {
                Guard::trip($pdo, $actor, 'bypass_ignored');
            }
            $result = $loop->run($history, $facts);
        } catch (HttpError $error) {
            if ($error->status === 429) {
                $message = (string) ($error->extra['message'] ?? Semaphore::FULL_MESSAGE);
                return self::denied($response, 429, 'rate_limit', $message, $error->headers);
            }
            if ($error->status === 503 && ($error->extra['fallback'] ?? false) === true) {
                return self::denied($response, 503, 'provider_error', (string) ($error->extra['message'] ?? 'ผู้ช่วยตอบไม่ได้ในตอนนี้'), []);
            }
            if ($error->status === 403 && $error->error === 'turnstile_required') {
                return self::denied($response, 403, 'unknown', (string) ($error->extra['message'] ?? 'ยืนยันว่าไม่ใช่บอทก่อนใช้ AI ในรอบนี้'), []);
            }
            throw $error;
        } finally {
            if ($token !== '') {
                $budget->release($pdo, $token);
            }
        }
        $sessionId = self::sessionId($body['sessionId'] ?? null);
        Journal::write($pdo, $actor, $sessionId, is_array($body['messages'] ?? null) ? $body['messages'] : [], $result, Clock::ms() - $started, null);
        $sse = strtolower(trim((string) ($config['AGENT_SSE'] ?? '0')));
        $payload = [
            'id' => 'agent-' . bin2hex(random_bytes(8)),
            'role' => 'assistant',
            'parts' => $result['parts'],
            'provider' => $result['provider'],
            'model' => $result['model'],
            'finishReason' => $result['finishReason'],
            'truncated' => $result['truncated'],
            'sessionId' => $sessionId,
        ];
        return Reply::json($response, 200, $payload)
            ->withHeader('X-Agent-Stream-Version', '2')
            ->withHeader('X-Agent-Provider', (string) $result['provider'])
            ->withHeader('X-Agent-SSE', in_array($sse, ['1', 'true', 'on'], true) ? 'pending' : 'off')
            ->withHeader('X-Chat-Session-Id', $sessionId ?? '');
    }

    private static function sync(ServerRequestInterface $request, ResponseInterface $response, \PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $sessionId = self::sessionId($request->getQueryParams()['sessionId'] ?? null);
        if ($sessionId === null) {
            throw new HttpError(400, 'invalid_input', ['field' => 'sessionId']);
        }
        $latest = Journal::latest($pdo, (string) $actor->accountId, $sessionId);
        if ($latest === null || $latest['parts'] === null) {
            return Reply::json($response, 200, ['parts' => null]);
        }
        return Reply::json($response, 200, $latest);
    }

    private static function denied(ResponseInterface $response, int $status, string $reason, string $message, array $headers): ResponseInterface
    {
        $response = Reply::json($response, $status, Loop::fallback($reason, $message));
        foreach ($headers as $name => $value) {
            if (is_string($name) && is_string($value)) {
                $response = $response->withHeader($name, $value);
            }
        }
        return $response;
    }

    private static function history(mixed $messages, int $max): array
    {
        if (!is_array($messages)) {
            return [];
        }
        $max = max(1, min(12, $max));
        $lines = [];
        foreach ($messages as $message) {
            if (!is_array($message)) {
                continue;
            }
            $role = (string) ($message['role'] ?? '');
            if ($role !== 'user' && $role !== 'assistant') {
                continue;
            }
            $text = Prompt::plain(Journal::messageText($message), 2000);
            if ($text === '') {
                continue;
            }
            $lines[] = ['role' => $role, 'content' => $text];
        }
        return array_slice($lines, -$max);
    }

    private static function facts(mixed $facts, Actor $actor, int $max): array
    {
        if (!is_array($facts) || $actor->accountId === null) {
            return [];
        }
        $max = max(0, min(20, $max));
        $kept = [];
        foreach ($facts as $fact) {
            if (!is_array($fact)) {
                continue;
            }
            if (($fact['userId'] ?? null) !== $actor->accountId) {
                continue;
            }
            $content = Prompt::plain((string) ($fact['content'] ?? ''), 240);
            if ($content === '') {
                continue;
            }
            $kept[] = [
                'content' => $content,
                'createdAt' => is_string($fact['createdAt'] ?? null) ? $fact['createdAt'] : '',
            ];
            if (count($kept) >= $max) {
                break;
            }
        }
        return $kept;
    }

    private static function coords(mixed $value): ?array
    {
        if (!is_array($value) || !is_numeric($value['lat'] ?? null) || !is_numeric($value['lng'] ?? null)) {
            return null;
        }
        $lat = (float) $value['lat'];
        $lng = (float) $value['lng'];
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return null;
        }
        $point = ['lat' => $lat, 'lng' => $lng];
        if (is_numeric($value['accuracy'] ?? null)) {
            $point['accuracy'] = (float) $value['accuracy'];
        }
        return $point;
    }

    private static function sessionId(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '' || strlen($value) > 64 || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
            return null;
        }
        return $value;
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }
}
