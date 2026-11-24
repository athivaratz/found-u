<?php

declare(strict_types=1);

namespace Foundu\Agent;

use Foundu\Ai\AgentReply;
use Foundu\Ai\Credentials;
use Foundu\Ai\Generate;
use Foundu\Auth\Actor;
use Foundu\Http\HttpError;

final class Loop
{
    private const HARD_STEPS = 6;
    private const POST_TOOL = 'You have tool results. Reply in complete Thai — English only for technical terms (e.g. Tracking Code, LOST-XXXXXX). No Chinese/Japanese/Korean or other scripts. No more tool calls. Finish every sentence and list item; do not stop mid-word.';

    private string $provider = '';
    private string $model = '';

    public function __construct(
        private readonly \PDO $pdo,
        private readonly Actor $actor,
        private readonly array $settings,
        private readonly array $config,
        private readonly Generate $generate,
        private readonly Credentials $credentials,
        private readonly ?array $clientLocation,
        private readonly bool $adminBypass,
        private readonly int $wallMs,
    ) {
    }

    public function run(array $history, array $facts): array
    {
        $providers = $this->providers();
        if ($providers === []) {
            throw new HttpError(503, 'provider_error', self::fallback('provider_error', 'ผู้ช่วยยังไม่ได้ตั้งค่า'));
        }
        $system = Prompt::build($this->settings, $this->actor->accountId !== null, $facts);
        $joined = '';
        foreach ($history as $line) {
            $joined .= ' ' . ($line['content'] ?? '');
        }
        if (Guard::injection($joined)) {
            Guard::trip($this->pdo, $this->actor, 'prompt_injection_marker');
        }
        $messages = [['role' => 'system', 'content' => $system]];
        foreach ($history as $line) {
            $role = $line['role'] === 'assistant' ? 'assistant' : 'user';
            $tag = $role === 'assistant' ? 'ASSISTANT' : 'USER';
            $messages[] = [
                'role' => $role,
                'content' => '<<<' . $tag . ">>>\n" . $line['content'] . "\n<<<END>>>",
            ];
        }
        $tools = new Tools(
            $this->pdo,
            $this->actor,
            $this->settings,
            $this->config,
            $this->clientLocation,
            $this->adminBypass,
            $this->generate,
            $this->credentials
        );
        $steps = max(1, min(self::HARD_STEPS, (int) ($this->settings['agentMaxSteps'] ?? 4)));
        $deadline = Clock::ms() + $this->wallMs;
        $temperature = is_numeric($this->settings['agentTemperature'] ?? null) ? (float) $this->settings['agentTemperature'] : 0.3;
        $maxTokens = (int) ($this->settings['agentMaxOutputTokens'] ?? 2048);
        if ($maxTokens < 128) {
            $maxTokens = 128;
        }
        if ($maxTokens > 2048) {
            $maxTokens = 2048;
        }
        $parts = [];
        $text = '';
        $allowedCodes = [];
        $usedTools = false;
        $finish = 'stop';
        $truncated = false;
        $timedOut = false;
        $stepLog = [];

        for ($step = 1; $step <= $steps; $step++) {
            $remaining = $deadline - Clock::ms();
            if ($remaining < 2000) {
                $timedOut = true;
                $finish = 'timeout';
                break;
            }
            $allowTools = !$usedTools;
            $reply = $this->turn($providers, $messages, $allowTools, $temperature, $maxTokens, (int) min(20, max(2, intdiv($remaining, 1000) - 1)));
            if ($reply === null) {
                if ($text === '' && $parts === []) {
                    throw new HttpError(503, 'provider_error', self::fallback('provider_error', 'ผู้ช่วยตอบไม่ได้ในตอนนี้ ลองใหม่หรือใช้เมนูด้านล่าง'));
                }
                $finish = 'provider_error';
                $truncated = true;
                break;
            }
            $stepLog[] = [
                'stepNumber' => $step,
                'finishReason' => $reply->finishReason,
                'toolCalls' => array_map(static fn (array $call): string => (string) $call['name'], $reply->calls),
                'provider' => $reply->provider,
            ];
            $piece = Guard::filterText($reply->text);
            if (Guard::blockedScript($reply->text, $piece)) {
                Guard::trip($this->pdo, $this->actor, 'blocked_script');
            }
            if ($allowTools && $reply->calls !== []) {
                $usedTools = true;
                $calls = array_slice($reply->calls, 0, 3);
                $messages[] = ['role' => 'assistant', 'content' => $piece, 'calls' => $calls];
                foreach ($calls as $call) {
                    $envelope = $tools->call((string) $call['name'], is_array($call['args']) ? $call['args'] : [], $deadline - Clock::ms());
                    foreach ($tools->codes($envelope) as $code) {
                        $allowedCodes[] = $code;
                    }
                    $encoded = json_encode($envelope, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '{}';
                    $messages[] = [
                        'role' => 'tool',
                        'name' => (string) $call['name'],
                        'id' => (string) $call['id'],
                        'content' => "<<<TOOL " . $call['name'] . ">>>\n" . $encoded . "\n<<<END>>>",
                    ];
                    $parts[] = [
                        'type' => 'tool-' . $call['name'],
                        'toolCallId' => (string) $call['id'],
                        'state' => 'output-available',
                        'input' => is_array($call['args']) ? self::publicArgs($call['args']) : [],
                        'output' => $envelope,
                    ];
                }
                $messages[] = ['role' => 'user', 'content' => self::POST_TOOL];
                if ($piece !== '') {
                    $text = trim($text . "\n" . $piece);
                }
                continue;
            }
            $text = trim($text . "\n" . $piece);
            $finish = $reply->finishReason !== '' ? $reply->finishReason : 'stop';
            break;
        }

        if ($step > $steps && $usedTools && trim($text) === '') {
            $finish = 'step-count';
        }
        if ($timedOut || ($usedTools && trim($text) === '')) {
            $text = trim($text . "\n\n" . self::partial($parts, $timedOut));
            $truncated = true;
            if ($timedOut) {
                $finish = 'timeout';
            } elseif ($finish === 'stop') {
                $finish = 'step-count';
            }
        } elseif (Guard::looksTruncated($text, $finish)) {
            $truncated = true;
        }
        $text = trim($text);
        if (Guard::inventedCodes($text, $allowedCodes) !== []) {
            Guard::trip($this->pdo, $this->actor, 'hallucinated_tracking_code');
        }
        if ($text !== '') {
            $parts[] = ['type' => 'text', 'text' => $text];
        }
        return [
            'text' => $text,
            'parts' => $parts,
            'steps' => $stepLog,
            'provider' => $this->provider,
            'model' => $this->model,
            'finishReason' => $finish,
            'truncated' => $truncated,
        ];
    }

    private function turn(array $providers, array $messages, bool $allowTools, float $temperature, int $maxTokens, int $timeout): ?AgentReply
    {
        $order = $this->provider === '' ? $providers : array_values(array_unique(array_merge([$this->provider], $providers)));
        foreach ($order as $provider) {
            $model = $provider === 'openrouter' ? $this->openRouterModel() : $this->geminiModel();
            $reply = $this->generate->agent(
                $this->credentials,
                $provider,
                $model,
                $messages,
                $allowTools ? Tools::schema() : [],
                [
                    'temperature' => $temperature,
                    'maxOutputTokens' => $maxTokens,
                    'routing' => self::routing($this->settings),
                ],
                $timeout
            );
            if ($reply !== null) {
                $this->provider = $reply->provider;
                $this->model = $reply->model;
                return $reply;
            }
        }
        return null;
    }

    private function providers(): array
    {
        $mode = (string) ($this->settings['agentProvider'] ?? 'auto');
        if (!in_array($mode, ['auto', 'gemini', 'openrouter'], true)) {
            $mode = 'auto';
        }
        $primary = $mode === 'openrouter' ? 'openrouter' : 'gemini';
        $fallback = (string) ($this->settings['agentFallbackProvider'] ?? 'openrouter') === 'gemini' ? 'gemini' : 'openrouter';
        if ($mode === 'auto') {
            $fallback = 'openrouter';
        }
        if ($fallback === $primary) {
            $fallback = $primary === 'gemini' ? 'openrouter' : 'gemini';
        }
        $out = [];
        foreach ([$primary, $fallback] as $name) {
            if (in_array($name, $out, true)) {
                continue;
            }
            if ($name === 'gemini' && $this->credentials->gemini === null) {
                continue;
            }
            if ($name === 'openrouter' && $this->credentials->openrouter === null) {
                continue;
            }
            $out[] = $name;
        }
        return $out;
    }

    private function geminiModel(): string
    {
        $model = trim((string) ($this->settings['agentModel'] ?? 'gemini-2.0-flash'));
        return $model !== '' ? $model : 'gemini-2.0-flash';
    }

    private function openRouterModel(): string
    {
        $model = trim((string) ($this->settings['agentOpenRouterModel'] ?? ''));
        if ($model === '') {
            $model = $this->credentials->openrouterModel;
        }
        return $model !== '' ? $model : 'google/gemini-2.0-flash-exp:free';
    }

    private static function routing(array $settings): array
    {
        $order = [];
        foreach ($settings['agentOpenRouterProviderOrder'] ?? [] as $slug) {
            if (is_string($slug) && $slug !== '') {
                $order[] = $slug;
            }
        }
        $ignore = [];
        foreach ($settings['agentOpenRouterProviderIgnore'] ?? [] as $slug) {
            if (is_string($slug) && $slug !== '') {
                $ignore[] = $slug;
            }
        }
        $lock = ($settings['agentOpenRouterLockProvider'] ?? false) === true;
        $allow = ($settings['agentOpenRouterAllowFallbacks'] ?? false) === true;
        $flaky = $order !== [];
        foreach ($order as $slug) {
            if (!str_starts_with($slug, 'baidu/')) {
                $flaky = false;
            }
        }
        if ($lock && $flaky) {
            $lock = false;
            $allow = true;
            $order = [];
        }
        $sort = (string) ($settings['agentOpenRouterProviderSort'] ?? 'latency');
        if (!in_array($sort, ['price', 'throughput', 'latency'], true)) {
            $sort = 'latency';
        }
        $provider = ['sort' => $sort, 'allow_fallbacks' => $lock ? false : $allow];
        if ($order !== []) {
            $provider[$lock ? 'only' : 'order'] = array_slice($order, 0, 5);
        }
        if ($ignore !== []) {
            $provider['ignore'] = array_slice($ignore, 0, 8);
        }
        return $provider;
    }

    private static function partial(array $parts, bool $timedOut): string
    {
        $names = [];
        foreach ($parts as $part) {
            $output = $part['output'] ?? null;
            if (!is_array($output) || ($output['ok'] ?? false) !== true) {
                continue;
            }
            $data = $output['data'] ?? null;
            if (!is_array($data)) {
                continue;
            }
            foreach (['lost', 'found'] as $side) {
                if (!is_array($data[$side] ?? null)) {
                    continue;
                }
                foreach ($data[$side] as $item) {
                    if (is_array($item) && is_string($item['itemName'] ?? null) && $item['itemName'] !== '') {
                        $names[$item['itemName']] = true;
                    }
                }
            }
            $item = $data['item'] ?? null;
            if (is_array($item) && is_string($item['itemName'] ?? null) && $item['itemName'] !== '') {
                $names[$item['itemName']] = true;
            }
        }
        $lead = $names === []
            ? 'ยังสรุปคำตอบไม่ทันครับ'
            : 'เจอในระบบแล้ว: ' . implode(', ', array_slice(array_keys($names), 0, 3));
        if ($timedOut) {
            return $lead . ' ใช้เวลาตอบนานกว่าที่ระบบรับได้ ลองถามใหม่อีกครั้งครับ';
        }
        return $lead . ' ลองถามต่อได้ถ้าต้องการรายละเอียดเพิ่มครับ';
    }

    private static function publicArgs(array $args): array
    {
        $out = [];
        foreach ($args as $key => $value) {
            if (!is_string($key)) {
                continue;
            }
            if ($key === 'imageBase64' || $key === 'imageUrl') {
                $out[$key] = '[image]';
                continue;
            }
            if (is_string($value)) {
                $out[$key] = Prompt::plain($value, 200);
            } elseif (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    public static function fallback(string $reason, string $message): array
    {
        return [
            'fallback' => true,
            'reason' => $reason,
            'message' => $message,
            'suggestedRoutes' => [
                ['href' => '/home', 'labelKey' => 'home'],
                ['href' => '/tracking', 'labelKey' => 'tracking'],
                ['href' => '/lost', 'labelKey' => 'lost'],
                ['href' => '/found', 'labelKey' => 'found'],
            ],
        ];
    }
}
