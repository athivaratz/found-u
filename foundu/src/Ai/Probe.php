<?php

declare(strict_types=1);

namespace Foundu\Ai;

final class Probe
{
    public static function providers(Generate $generate, Credentials $credentials, ?string $only): array
    {
        $out = [];
        foreach (['gemini', 'openrouter'] as $name) {
            if ($only !== null && $only !== $name) {
                continue;
            }
            $configured = $name === 'gemini' ? $credentials->gemini !== null : $credentials->openrouter !== null;
            if (!$configured) {
                $out[$name] = ['configured' => false, 'ok' => false];
                continue;
            }
            $forced = new Credentials(
                $name === 'gemini' ? $credentials->gemini : null,
                $name === 'openrouter' ? $credentials->openrouter : null,
                $credentials->openrouterModel,
                $name,
                $credentials->source,
                $credentials->configuredAt,
            );
            $result = $generate->text(
                $forced,
                'Reply with JSON {"ok":true} only.',
                ['model' => 'gemini-1.5-flash', 'temperature' => 0, 'topP' => 1, 'maxOutputTokens' => 32],
                8
            );
            $entry = [
                'configured' => true,
                'ok' => $result !== null,
                'model' => $result !== null ? $result->model : ($name === 'openrouter' ? $credentials->openrouterModel : 'gemini-1.5-flash'),
            ];
            if ($result === null) {
                $entry['error'] = 'provider_error';
            }
            $out[$name] = $entry;
        }
        return $out;
    }

    public static function endpoints(Upstream $upstream, Credentials $credentials, string $model): array
    {
        $model = trim($model);
        if ($model === '') {
            $model = $credentials->openrouterModel;
        }
        if ($credentials->openrouter === null) {
            return ['status' => 503, 'body' => ['error' => 'OpenRouter API key is not configured', 'modelId' => $model, 'endpoints' => []]];
        }
        if (strlen($model) > 191 || preg_match('/^[A-Za-z0-9_.:\/+-]{1,191}$/', $model) !== 1) {
            return ['status' => 400, 'body' => ['error' => 'invalid_input', 'field' => 'model', 'modelId' => '', 'endpoints' => []]];
        }
        $encoded = implode('/', array_map('rawurlencode', explode('/', $model)));
        $response = $upstream->request(
            'GET',
            'https://openrouter.ai/api/v1/models/' . $encoded . '/endpoints',
            ['Authorization' => 'Bearer ' . $credentials->openrouter],
            null,
            8
        );
        if (!$response->ok()) {
            return ['status' => 502, 'body' => ['error' => 'provider_error', 'modelId' => $model, 'endpoints' => []]];
        }
        try {
            $decoded = json_decode($response->body, true, 12, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return ['status' => 502, 'body' => ['error' => 'provider_error', 'modelId' => $model, 'endpoints' => []]];
        }
        $endpoints = [];
        if (is_array($decoded)) {
            if (isset($decoded['endpoints']) && is_array($decoded['endpoints'])) {
                $endpoints = $decoded['endpoints'];
            } elseif (isset($decoded['data']['endpoints']) && is_array($decoded['data']['endpoints'])) {
                $endpoints = $decoded['data']['endpoints'];
            }
        }
        return ['status' => 200, 'body' => ['modelId' => $model, 'endpoints' => array_values($endpoints)]];
    }
}
