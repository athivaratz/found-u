<?php

declare(strict_types=1);

namespace Foundu\Ai;

// cURL only, and only the two hosts the app is allowed to call. Timeouts
// stay under a 30s max_execution_time. Redirects are off so a 30x cannot
// point the key at some other host.
final class CurlUpstream implements Upstream
{
    private const HOSTS = [
        'generativelanguage.googleapis.com' => true,
        'openrouter.ai' => true,
    ];

    public function request(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds): UpstreamResult
    {
        $parts = parse_url($url);
        $host = is_array($parts) ? strtolower((string) ($parts['host'] ?? '')) : '';
        $scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
        if ($scheme !== 'https' || !isset(self::HOSTS[$host])) {
            return new UpstreamResult(0, '', 'upstream_host');
        }
        if (!function_exists('curl_init')) {
            return new UpstreamResult(0, '', 'curl_missing');
        }
        $timeoutSeconds = max(1, min(20, $timeoutSeconds));
        $ch = curl_init($url);
        if ($ch === false) {
            return new UpstreamResult(0, '', 'curl_init');
        }
        $headerLines = [];
        foreach ($headers as $name => $value) {
            if (is_string($name) && is_string($value)) {
                $headerLines[] = $name . ': ' . $value;
            }
        }
        $opts = [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'found-u',
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($errno !== 0 || !is_string($raw)) {
            return new UpstreamResult($status, '', 'upstream_timeout');
        }
        return new UpstreamResult($status, $raw, null);
    }
}
