<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Auth\Actor;
use Foundu\Auth\Authz;
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
        $app->get('/vision', static function ($request, $response) use ($pdo) {
            return self::quota($request, $response, Gate::db($pdo));
        });
        $app->post('/vision', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::vision($request, $response, Gate::db($pdo), $config, $budget);
        });
        $app->get('/ner', static function ($request, $response) use ($pdo) {
            return self::quota($request, $response, Gate::db($pdo));
        });
        $app->post('/ner', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::ner($request, $response, Gate::db($pdo), $config, $budget);
        });
        $app->get('/admin/ai-credentials', static function ($request, $response) use ($pdo, $config) {
            return self::credentialGet($request, $response, Gate::db($pdo), $config);
        });
        $app->patch('/admin/ai-credentials', static function ($request, $response) use ($pdo, $config) {
            return self::credentialSave($request, $response, Gate::db($pdo), $config, false);
        });
        $app->post('/admin/ai-credentials/rotate', static function ($request, $response) use ($pdo, $config) {
            return self::credentialSave($request, $response, Gate::db($pdo), $config, true);
        });
        $app->post('/admin/ai-credentials/test', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::credentialTest($request, $response, Gate::db($pdo), $config, $budget);
        });
        $app->get('/agent/test-providers', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::testProviders($request, $response, Gate::db($pdo), $config, $budget, null);
        });
        $app->post('/agent/test-providers', static function ($request, $response) use ($pdo, $config, $budget) {
            $body = self::body($request, false);
            $provider = $body['provider'] ?? null;
            if ($provider !== null && $provider !== 'gemini' && $provider !== 'openrouter') {
                throw new HttpError(400, 'invalid_input', ['field' => 'provider']);
            }
            return self::testProviders($request, $response, Gate::db($pdo), $config, $budget, is_string($provider) ? $provider : null);
        });
        $app->get('/agent/openrouter/endpoints', static function ($request, $response) use ($pdo, $config, $budget) {
            return self::endpoints($request, $response, Gate::db($pdo), $config, $budget);
        });
        $app->get('/ai/models', static function ($request, $response) use ($pdo, $config) {
            Authz::requireRole(Gate::actor($request), Actor::ADMIN);
            $db = Gate::db($pdo);
            $settings = Settings::read($db);
            $credentials = Credentials::load($db, $config);
            return Reply::json($response, 200, [
                'models' => [
                    ['id' => (string) ($settings['aiVisionModel'] ?? 'gemini-1.5-flash'), 'provider' => 'gemini'],
                    ['id' => (string) ($settings['aiNerModel'] ?? 'gemini-1.5-flash'), 'provider' => 'gemini'],
                    ['id' => (string) ($settings['aiMatchingModel'] ?? 'gemini-1.5-flash'), 'provider' => 'gemini'],
                    ['id' => $credentials->openrouterModel, 'provider' => 'openrouter'],
                ],
            ]);
        });
    }

    private static function quota(ServerRequestInterface $request, ResponseInterface $response, \PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $settings = Settings::read($pdo);
        return Reply::json($response, 200, Budget::snapshot($pdo, (string) $actor->accountId, $settings, time()));
    }

    private static function vision(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $body = self::body($request, true);
        [$mime, $base64] = Vision::image($body);
        $settings = Settings::read($pdo);
        $testMode = ($body['testMode'] ?? false) === true && $actor->isAdmin();
        @set_time_limit(26);
        $token = $budget->lease($pdo, $actor->accountId, time());
        try {
            $charged = $budget->charge($pdo, $actor, 'vision', $settings, $testMode, time());
            if (!$testMode) {
                Feed::bump($pdo, 'ai_usage');
            }
            $extracted = Vision::extract(Generate::fromConfig($config), Credentials::load($pdo, $config), $mime, $base64, $settings);
        } finally {
            $budget->release($pdo, $token);
        }
        if ($extracted === null) {
            throw new HttpError(500, 'Failed to extract data from image');
        }
        $payload = ['data' => $extracted['data']];
        if ($testMode) {
            $payload['formMapping'] = Vision::form($extracted['data']);
            $payload['debug'] = $extracted['debug'];
            $payload['meta'] = [
                'model' => $extracted['debug']['model'],
                'provider' => $extracted['debug']['provider'],
            ];
            $payload['quota'] = [
                'userRemainingMinute' => $charged->userRemainingMinute,
                'userRemainingHour' => $charged->userRemainingHour,
                'systemRemainingMinute' => $charged->systemRemainingMinute,
                'systemRemainingHour' => $charged->systemRemainingHour,
            ];
        }
        return Reply::json($response, 200, $payload);
    }

    private static function ner(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::USER);
        $body = self::body($request, true);
        $text = $body['text'] ?? null;
        if (!is_string($text) || trim($text) === '' || mb_strlen($text, 'UTF-8') > 4000) {
            throw new HttpError(400, 'invalid_input', ['field' => 'text']);
        }
        $type = $body['type'] ?? 'lost';
        if ($type !== 'lost' && $type !== 'found') {
            throw new HttpError(400, 'invalid_input', ['field' => 'type']);
        }
        $settings = Settings::read($pdo);
        @set_time_limit(26);
        $token = $budget->lease($pdo, $actor->accountId, time());
        try {
            $budget->charge($pdo, $actor, 'ner', $settings, false, time());
            Feed::bump($pdo, 'ai_usage');
            $extracted = Ner::extract(Generate::fromConfig($config), Credentials::load($pdo, $config), trim($text), $type, $settings);
        } finally {
            $budget->release($pdo, $token);
        }
        return Reply::json($response, 200, $extracted);
    }

    private static function credentialGet(ServerRequestInterface $request, ResponseInterface $response, \PDO $pdo, array $config): ResponseInterface
    {
        Authz::requireRole(Gate::actor($request), Actor::ADMIN);
        return Reply::json($response, 200, Credentials::load($pdo, $config)->flags());
    }

    private static function credentialSave(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        bool $rotate,
    ): ResponseInterface {
        Authz::requireRole(Gate::actor($request), Actor::ADMIN);
        $body = self::body($request, false);
        $patch = [];
        if ($rotate) {
            $patch['rotateStored'] = true;
            $current = Credentials::load($pdo, $config);
            if ($current->gemini === null && $current->openrouter === null && !isset($body['geminiApiKey']) && !isset($body['openrouterApiKey'])) {
                throw new HttpError(400, 'invalid_input', ['field' => 'apiKey']);
            }
            $patch['provider'] = $current->provider;
        }
        foreach (['provider', 'geminiApiKey', 'openrouterApiKey', 'openrouterModel'] as $field) {
            if (array_key_exists($field, $body)) {
                $patch[$field] = $body[$field];
            }
        }
        $saved = Credentials::save($pdo, $config, $patch);
        $flags = $saved->flags();
        $flags['ok'] = true;
        return Reply::json($response, 200, $flags);
    }

    private static function credentialTest(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
    ): ResponseInterface {
        Authz::requireRole(Gate::actor($request), Actor::ADMIN);
        $body = self::body($request, true);
        $provider = $body['provider'] ?? null;
        if ($provider !== 'gemini' && $provider !== 'openrouter') {
            throw new HttpError(400, 'invalid_input', ['field' => 'provider']);
        }
        return self::testProviders($request, $response, $pdo, $config, $budget, $provider);
    }

    private static function testProviders(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
        ?string $only,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::ADMIN);
        @set_time_limit(26);
        $token = $budget->lease($pdo, $actor->accountId, time());
        try {
            $credentials = Credentials::load($pdo, $config);
            $providers = Probe::providers(Generate::fromConfig($config), $credentials, $only);
        } finally {
            $budget->release($pdo, $token);
        }
        return Reply::json($response, 200, [
            'providers' => $providers,
            'settingsSource' => $credentials->source,
        ]);
    }

    private static function endpoints(
        ServerRequestInterface $request,
        ResponseInterface $response,
        \PDO $pdo,
        array $config,
        Budget $budget,
    ): ResponseInterface {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, Actor::ADMIN);
        $model = (string) ($request->getQueryParams()['model'] ?? '');
        @set_time_limit(20);
        $token = $budget->lease($pdo, $actor->accountId, time());
        try {
            $result = Probe::endpoints(Runtime::upstream(), Credentials::load($pdo, $config), $model);
        } finally {
            $budget->release($pdo, $token);
        }
        return Reply::json($response, $result['status'], $result['body']);
    }

    private static function body(ServerRequestInterface $request, bool $required): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        // json_decode('{}') is [] and array_is_list([]) is true, so an
        // empty object cannot be told apart from a list. Optional bodies
        // accept that. A required body still must be an object with fields.
        if ($body === null || $body === []) {
            if ($required) {
                throw new HttpError(400, 'invalid_input', ['field' => 'body']);
            }
            return [];
        }
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }
}
