<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Config;

interface FormPoster
{
    public function post(string $url, array $fields, int $timeoutSeconds): string;
}

final class CurlPoster implements FormPoster
{
    public function post(string $url, array $fields, int $timeoutSeconds): string
    {
        if (!function_exists('curl_init')) {
            throw new \RuntimeException('curl missing');
        }
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(3, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        if ($body === false || $errno !== 0) {
            throw new \RuntimeException('turnstile request failed');
        }
        return is_string($body) ? $body : '';
    }
}

final class TurnstileResult
{
    public function __construct(
        public readonly bool $ok,
        public readonly bool $skipped,
    ) {
    }
}

// Siteverify only. An empty secret, or TURNSTILE_ENABLED=0, skips the call
// so local docker can run without a widget. TURNSTILE_ENABLED=1 with no
// secret fails closed. A network error or a timeout also fails closed.
final class Turnstile
{
    private const URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public function __construct(
        private readonly array $config,
        private readonly FormPoster $poster,
        private readonly int $timeoutSeconds = 5,
    ) {
    }

    public static function fromConfig(array $config, ?FormPoster $poster = null): self
    {
        return new self($config, $poster ?? new CurlPoster(), 5);
    }

    public function enabled(): bool
    {
        $flag = strtolower(trim((string) ($this->config['TURNSTILE_ENABLED'] ?? '')));
        if (in_array($flag, ['0', 'false', 'off'], true)) {
            return false;
        }
        $secret = trim((string) ($this->config['TURNSTILE_SECRET'] ?? ''));
        if (in_array($flag, ['1', 'true', 'on'], true)) {
            return true;
        }
        return $secret !== '';
    }

    public function verify(string $token, string $remoteIp): TurnstileResult
    {
        if (!$this->enabled()) {
            return new TurnstileResult(true, true);
        }
        $secret = trim((string) ($this->config['TURNSTILE_SECRET'] ?? ''));
        if ($secret === '' || $token === '' || strlen($token) > 2048) {
            return new TurnstileResult(false, false);
        }
        try {
            $raw = $this->poster->post(self::URL, [
                'secret' => $secret,
                'response' => $token,
                'remoteip' => $remoteIp,
            ], $this->timeoutSeconds);
            $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return new TurnstileResult(false, false);
        }
        $ok = is_array($data) && ($data['success'] ?? false) === true;
        return new TurnstileResult($ok, false);
    }
}
