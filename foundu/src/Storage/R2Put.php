<?php

declare(strict_types=1);

namespace Foundu\Storage;

use RuntimeException;

final class R2Put implements ObjectPut
{
    public function __construct(
        private readonly string $accountId,
        private readonly string $accessKey,
        private readonly string $secret,
        private readonly string $bucket,
        private readonly mixed $send = null,
        private readonly string $region = 'auto',
    ) {
    }

    public static function fromConfig(array $config, mixed $send = null): ?self
    {
        $account = trim((string) ($config['R2_ACCOUNT_ID'] ?? ''));
        $key = trim((string) ($config['R2_ACCESS_KEY_ID'] ?? ''));
        $secret = trim((string) ($config['R2_SECRET_ACCESS_KEY'] ?? ''));
        $bucket = trim((string) ($config['R2_BUCKET_NAME'] ?? ''));
        if ($account === '' || $key === '' || $secret === '' || $bucket === '') {
            return null;
        }
        $region = trim((string) ($config['R2_REGION'] ?? ''));
        if ($region === '') {
            $region = 'auto';
        }
        return new self($account, $key, $secret, $bucket, $send, $region);
    }

    public function putFile(string $key, string $contentType, string $path): void
    {
        if (!is_file($path)) {
            throw new RuntimeException('upload file is missing');
        }
        $hash = hash_file('sha256', $path);
        if ($hash === false) {
            throw new RuntimeException('could not hash upload');
        }
        self::encodeKey($key);
        $host = $this->accountId . '.r2.cloudflarestorage.com';
        $uri = SigV4::encodePath('/' . $this->bucket . '/' . $key);
        $amzDate = gmdate('Ymd\THis\Z');
        $authorization = SigV4::authorization(
            'PUT',
            $uri,
            '',
            $host,
            [
                'content-type' => $contentType,
                'x-amz-content-sha256' => $hash,
                'x-amz-date' => $amzDate,
            ],
            $hash,
            $this->accessKey,
            $this->secret,
            $this->region,
            $amzDate
        );
        $headers = [
            'Authorization' => $authorization,
            'Content-Type' => $contentType,
            'x-amz-content-sha256' => $hash,
            'x-amz-date' => $amzDate,
        ];
        $url = 'https://' . $host . $uri;
        if ($this->send !== null) {
            $code = ($this->send)($url, $headers, $path);
            if (!is_int($code) || $code < 200 || $code >= 300) {
                throw new RuntimeException('R2 upload failed');
            }
            return;
        }
        self::curl($url, $headers, $path);
    }

    public static function encodeKey(string $key): string
    {
        $parts = explode('/', $key);
        $encoded = [];
        foreach ($parts as $part) {
            if ($part === '' || $part === '.' || $part === '..') {
                throw new RuntimeException('bad object key');
            }
            $encoded[] = rawurlencode($part);
        }
        return implode('/', $encoded);
    }

    private static function curl(string $url, array $headers, string $path): void
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl is not available');
        }
        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('could not read upload');
        }
        $size = filesize($path);
        $ch = curl_init($url);
        if ($ch === false) {
            fclose($handle);
            throw new RuntimeException('curl failed');
        }
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        curl_setopt_array($ch, [
            CURLOPT_UPLOAD => true,
            CURLOPT_INFILE => $handle,
            CURLOPT_INFILESIZE => $size === false ? 0 : $size,
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_RETURNTRANSFER => true,
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        fclose($handle);
        if ($code < 200 || $code >= 300) {
            throw new RuntimeException('R2 upload failed');
        }
    }
}
