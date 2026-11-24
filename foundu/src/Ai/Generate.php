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

    public function agent(
        Credentials $credentials,
        string $provider,
        string $model,
        array $messages,
        array $tools,
        array $generation,
        int $timeout,
    ): ?AgentReply {
        $timeout = max(2, min(20, $timeout));
        if ($provider === 'openrouter') {
            return $this->agentOpenRouter($credentials, $model, $messages, $tools, $generation, $timeout);
        }
        return $this->agentGemini($credentials, $model, $messages, $tools, $generation, $timeout);
    }

    private function agentGemini(
        Credentials $credentials,
        string $model,
        array $messages,
        array $tools,
        array $generation,
        int $timeout,
    ): ?AgentReply {
        $key = $credentials->gemini;
        if ($key === null) {
            return null;
        }
        $model = $this->modelName($model);
        $system = '';
        $contents = [];
        foreach ($messages as $message) {
            $role = (string) ($message['role'] ?? '');
            if ($role === 'system') {
                $system .= ($system === '' ? '' : "\n\n") . (string) ($message['content'] ?? '');
                continue;
            }
            if ($role === 'tool') {
                $contents[] = [
                    'role' => 'user',
                    'parts' => [[
                        'functionResponse' => [
                            'name' => (string) ($message['name'] ?? ''),
                            'response' => ['text' => (string) ($message['content'] ?? '')],
                        ],
                    ]],
                ];
                continue;
            }
            $parts = [];
            if (is_array($message['calls'] ?? null) && $message['calls'] !== []) {
                foreach ($message['calls'] as $call) {
                    if (!is_array($call)) {
                        continue;
                    }
                    $parts[] = [
                        'functionCall' => [
                            'name' => (string) ($call['name'] ?? ''),
                            'args' => is_array($call['args'] ?? null) ? $call['args'] : new \stdClass(),
                        ],
                    ];
                }
            }
            $text = (string) ($message['content'] ?? '');
            if ($text !== '') {
                $parts[] = ['text' => $text];
            }
            if ($parts === []) {
                continue;
            }
            $contents[] = ['role' => $role === 'assistant' ? 'model' : 'user', 'parts' => $parts];
        }
        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => $generation['temperature'] ?? 0.3,
                'maxOutputTokens' => $generation['maxOutputTokens'] ?? 1024,
            ],
        ];
        if ($system !== '') {
            $payload['systemInstruction'] = ['parts' => [['text' => $system]]];
        }
        if ($tools !== []) {
            $payload['tools'] = [['functionDeclarations' => $tools]];
            $payload['toolConfig'] = ['functionCallingConfig' => ['mode' => 'AUTO']];
        } else {
            $payload['toolConfig'] = ['functionCallingConfig' => ['mode' => 'NONE']];
        }
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($key);
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
        return $this->readGemini($response->body, $model);
    }

    private function agentOpenRouter(
        Credentials $credentials,
        string $model,
        array $messages,
        array $tools,
        array $generation,
        int $timeout,
    ): ?AgentReply {
        $key = $credentials->openrouter;
        if ($key === null) {
            return null;
        }
        $model = $this->modelName($model);
        $wire = [];
        foreach ($messages as $message) {
            $role = (string) ($message['role'] ?? 'user');
            if ($role === 'tool') {
                $wire[] = [
                    'role' => 'tool',
                    'tool_call_id' => (string) ($message['id'] ?? ''),
                    'content' => (string) ($message['content'] ?? ''),
                ];
                continue;
            }
            if ($role === 'assistant' && is_array($message['calls'] ?? null) && $message['calls'] !== []) {
                $calls = [];
                foreach ($message['calls'] as $call) {
                    if (!is_array($call)) {
                        continue;
                    }
                    $calls[] = [
                        'id' => (string) ($call['id'] ?? ''),
                        'type' => 'function',
                        'function' => [
                            'name' => (string) ($call['name'] ?? ''),
                            'arguments' => json_encode(is_array($call['args'] ?? null) ? $call['args'] : [], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                        ],
                    ];
                }
                $wire[] = [
                    'role' => 'assistant',
                    'content' => (string) ($message['content'] ?? ''),
                    'tool_calls' => $calls,
                ];
                continue;
            }
            $mapped = $role === 'system' ? 'system' : ($role === 'assistant' ? 'assistant' : 'user');
            $wire[] = ['role' => $mapped, 'content' => (string) ($message['content'] ?? '')];
        }
        $payload = [
            'model' => $model,
            'messages' => $wire,
            'temperature' => $generation['temperature'] ?? 0.3,
            'max_tokens' => $generation['maxOutputTokens'] ?? 1024,
            'reasoning' => ['effort' => 'none'],
        ];
        $routing = $generation['routing'] ?? null;
        if (is_array($routing) && $routing !== []) {
            $payload['provider'] = $routing;
        }
        if ($tools !== []) {
            $listed = [];
            foreach ($tools as $tool) {
                $listed[] = [
                    'type' => 'function',
                    'function' => [
                        'name' => $tool['name'],
                        'description' => $tool['description'],
                        'parameters' => $tool['parameters'],
                    ],
                ];
            }
            $payload['tools'] = $listed;
            $payload['tool_choice'] = 'auto';
        } else {
            $payload['tool_choice'] = 'none';
        }
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
        return $this->readOpenRouter($response->body, $model);
    }

    private function readGemini(string $body, string $model): ?AgentReply
    {
        try {
            $decoded = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        $parts = $decoded['candidates'][0]['content']['parts'] ?? null;
        if (!is_array($parts)) {
            return null;
        }
        $text = '';
        $calls = [];
        foreach ($parts as $part) {
            if (!is_array($part)) {
                continue;
            }
            if (is_string($part['text'] ?? null)) {
                $text .= $part['text'];
            }
            $call = $part['functionCall'] ?? null;
            if (is_array($call) && is_string($call['name'] ?? null) && $call['name'] !== '') {
                $args = $call['args'] ?? [];
                $calls[] = [
                    'id' => 'call_' . substr(hash('sha256', $call['name'] . count($calls)), 0, 12),
                    'name' => $call['name'],
                    'args' => is_array($args) ? $args : [],
                ];
            }
        }
        $reason = (string) ($decoded['candidates'][0]['finishReason'] ?? 'STOP');
        return new AgentReply($text, $calls, strtolower($reason), 'gemini', $model);
    }

    private function readOpenRouter(string $body, string $model): ?AgentReply
    {
        try {
            $decoded = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        $message = $decoded['choices'][0]['message'] ?? null;
        if (!is_array($message)) {
            return null;
        }
        $text = '';
        $content = $message['content'] ?? '';
        if (is_string($content)) {
            $text = $content;
        } elseif (is_array($content)) {
            foreach ($content as $part) {
                if (is_array($part) && is_string($part['text'] ?? null)) {
                    $text .= $part['text'];
                }
            }
        }
        $calls = [];
        foreach ($message['tool_calls'] ?? [] as $call) {
            if (!is_array($call)) {
                continue;
            }
            $fn = $call['function'] ?? null;
            if (!is_array($fn) || !is_string($fn['name'] ?? null) || $fn['name'] === '') {
                continue;
            }
            $args = [];
            if (is_string($fn['arguments'] ?? null) && $fn['arguments'] !== '') {
                try {
                    $parsed = json_decode($fn['arguments'], true, 12, JSON_THROW_ON_ERROR);
                    $args = is_array($parsed) ? $parsed : [];
                } catch (\JsonException) {
                    $args = [];
                }
            }
            $calls[] = [
                'id' => is_string($call['id'] ?? null) && $call['id'] !== '' ? $call['id'] : ('call_' . count($calls)),
                'name' => $fn['name'],
                'args' => $args,
            ];
        }
        $reason = (string) ($decoded['choices'][0]['finish_reason'] ?? 'stop');
        return new AgentReply($text, $calls, $reason, 'openrouter', $model);
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
