<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Config;

final class GenerateResult
{
    public function __construct(
        public readonly string $text,
        public readonly string $provider,
        public readonly string $model,
        public readonly string $raw,
    ) {
    }
}

final class Generate
{
    public function __construct(
        private readonly Upstream $upstream,
        private readonly int $timeoutSeconds,
    ) {
    }

    public static function fromConfig(array $config, ?Upstream $upstream = null): self
    {
        $timeout = Config::int($config, 'AI_UPSTREAM_TIMEOUT', 12, 3, 20);
        return new self($upstream ?? Runtime::upstream(), $timeout);
    }

    public function text(Credentials $credentials, string $prompt, array $generation, ?int $timeout = null): ?GenerateResult
    {
        return $this->send($credentials, $prompt, null, null, $generation, $timeout);
    }

    public function vision(Credentials $credentials, string $prompt, string $mime, string $base64, array $generation, ?int $timeout = null): ?GenerateResult
    {
        return $this->send($credentials, $prompt, $mime, $base64, $generation, $timeout);
    }

    private function send(
        Credentials $credentials,
        string $prompt,
        ?string $mime,
        ?string $base64,
        array $generation,
        ?int $timeout,
    ): ?GenerateResult {
        $timeout ??= $this->timeoutSeconds;
        foreach ($credentials->order() as $provider) {
            $result = $provider === 'openrouter'
                ? $this->openRouter($credentials, $prompt, $mime, $base64, $generation, $timeout)
                : $this->gemini($credentials, $prompt, $mime, $base64, $generation, $timeout);
            if ($result !== null) {
                return $result;
            }
        }
        return null;
    }

    private function gemini(
        Credentials $credentials,
        string $prompt,
        ?string $mime,
        ?string $base64,
        array $generation,
        int $timeout,
    ): ?GenerateResult {
        $key = $credentials->gemini;
        if ($key === null) {
            return null;
        }
        $model = $this->modelName((string) ($generation['model'] ?? 'gemini-1.5-flash'));
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($key);
        $parts = [['text' => $prompt]];
        if ($mime !== null && $base64 !== null) {
            $parts[] = ['inlineData' => ['mimeType' => $mime, 'data' => $base64]];
        }
        $payload = [
            'contents' => [['parts' => $parts]],
            'generationConfig' => [
                'temperature' => $generation['temperature'] ?? 0.1,
                'maxOutputTokens' => $generation['maxOutputTokens'] ?? 256,
                'topP' => $generation['topP'] ?? 0.8,
                'responseMimeType' => 'application/json',
            ],
        ];
        $response = $this->upstream->request(
            'POST',
            $url,
            ['Content-Type' => 'application/json'],
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $timeout
        );
        if (!$response->ok()) {
            return null;
        }
        $text = Parse::geminiText($response->body);
        if ($text === null) {
            return null;
        }
        return new GenerateResult($text, 'gemini', $model, $response->body);
    }

    private function openRouter(
        Credentials $credentials,
        string $prompt,
        ?string $mime,
        ?string $base64,
        array $generation,
        int $timeout,
    ): ?GenerateResult {
        $key = $credentials->openrouter;
        if ($key === null) {
            return null;
        }
        $model = $credentials->openrouterModel !== '' ? $credentials->openrouterModel : 'google/gemini-2.0-flash-exp:free';
        if ($mime !== null && $base64 !== null) {
            $content = [
                ['type' => 'text', 'text' => $prompt],
                ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $mime . ';base64,' . $base64]],
            ];
        } else {
            $content = $prompt;
        }
        $payload = [
            'model' => $model,
            'messages' => [['role' => 'user', 'content' => $content]],
            'temperature' => $generation['temperature'] ?? 0.1,
            'max_tokens' => $generation['maxOutputTokens'] ?? 256,
            'top_p' => $generation['topP'] ?? 0.8,
            'response_format' => ['type' => 'json_object'],
        ];
        $response = $this->upstream->request(
            'POST',
            'https://openrouter.ai/api/v1/chat/completions',
            [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $key,
                'HTTP-Referer' => 'https://found-u.local',
                'X-Title' => 'Found-U',
            ],
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $timeout
        );
        if (!$response->ok()) {
            return null;
        }
        $text = Parse::openRouterText($response->body);
        if ($text === null) {
            return null;
        }
        return new GenerateResult($text, 'openrouter', $model, $response->body);
    }

    private function modelName(string $model): string
    {
        $model = trim($model);
        if (str_starts_with($model, 'models/')) {
            $model = substr($model, 7);
        }
        if ($model === '' || preg_match('/^[A-Za-z0-9_.:-]{1,120}$/', $model) !== 1) {
            return 'gemini-1.5-flash';
        }
        return $model;
    }
}
