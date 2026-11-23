<?php

declare(strict_types=1);

namespace Foundu\Storage;

// AWS Signature Version 4, query form, for a presigned URL.
// R2 and MinIO both check this. The payload line is UNSIGNED-PAYLOAD
// because the bytes are not known when the URL is minted. Pass
// content-type and content-length in $headers when the caller knows
// them: they are then part of the signature, and a client cannot swap
// either one after the URL is issued.
final class SigV4
{
    public static function presign(
        string $method,
        string $host,
        string $uri,
        string $accessKey,
        string $secret,
        string $region,
        array $headers,
        int $expires,
        string $amzDate,
        string $service = 's3',
    ): string {
        $date = substr($amzDate, 0, 8);
        $scope = $date . '/' . $region . '/' . $service . '/aws4_request';
        [$canonicalHeaders, $names] = self::headers($host, $headers);
        $query = self::query([
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => $accessKey . '/' . $scope,
            'X-Amz-Date' => $amzDate,
            'X-Amz-Expires' => (string) $expires,
            'X-Amz-SignedHeaders' => $names,
        ]);
        $canonical = strtoupper($method) . "\n" . $uri . "\n" . $query . "\n"
            . $canonicalHeaders . "\n" . $names . "\n" . 'UNSIGNED-PAYLOAD';
        $signature = self::signature($secret, $date, $region, $service, $amzDate, $canonical);
        return $query . '&X-Amz-Signature=' . $signature;
    }

    // Header form, used by the published GET vector and by the MinIO
    // bucket create in tests. The route itself only mints query URLs.
    public static function authorization(
        string $method,
        string $uri,
        string $query,
        string $host,
        array $headers,
        string $payloadHash,
        string $accessKey,
        string $secret,
        string $region,
        string $amzDate,
        string $service = 's3',
    ): string {
        $date = substr($amzDate, 0, 8);
        $scope = $date . '/' . $region . '/' . $service . '/aws4_request';
        [$canonicalHeaders, $names] = self::headers($host, $headers);
        $canonical = strtoupper($method) . "\n" . $uri . "\n" . $query . "\n"
            . $canonicalHeaders . "\n" . $names . "\n" . $payloadHash;
        $signature = self::signature($secret, $date, $region, $service, $amzDate, $canonical);
        return 'AWS4-HMAC-SHA256 Credential=' . $accessKey . '/' . $scope
            . ', SignedHeaders=' . $names . ', Signature=' . $signature;
    }

    public static function encodePath(string $path): string
    {
        $parts = explode('/', $path);
        $encoded = [];
        foreach ($parts as $part) {
            $encoded[] = rawurlencode($part);
        }
        $uri = implode('/', $encoded);
        if ($uri === '' || $uri[0] !== '/') {
            $uri = '/' . $uri;
        }
        return $uri;
    }

    private static function headers(string $host, array $headers): array
    {
        $signed = ['host' => self::squash($host)];
        foreach ($headers as $name => $value) {
            $signed[strtolower((string) $name)] = self::squash((string) $value);
        }
        ksort($signed);
        $block = '';
        foreach ($signed as $name => $value) {
            $block .= $name . ':' . $value . "\n";
        }
        return [$block, implode(';', array_keys($signed))];
    }

    private static function signature(
        string $secret,
        string $date,
        string $region,
        string $service,
        string $amzDate,
        string $canonical,
    ): string {
        $scope = $date . '/' . $region . '/' . $service . '/aws4_request';
        $string = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canonical);
        $key = hash_hmac(
            'sha256',
            'aws4_request',
            hash_hmac(
                'sha256',
                $service,
                hash_hmac('sha256', $region, hash_hmac('sha256', $date, 'AWS4' . $secret, true), true),
                true
            ),
            true
        );
        return hash_hmac('sha256', $string, $key);
    }

    private static function query(array $params): string
    {
        $pairs = [];
        foreach ($params as $key => $value) {
            $pairs[] = [rawurlencode((string) $key), rawurlencode((string) $value)];
        }
        usort($pairs, static function (array $a, array $b): int {
            return $a[0] <=> $b[0] ?: $a[1] <=> $b[1];
        });
        $joined = [];
        foreach ($pairs as [$key, $value]) {
            $joined[] = $key . '=' . $value;
        }
        return implode('&', $joined);
    }

    private static function squash(string $value): string
    {
        $squashed = preg_replace('/\s+/', ' ', trim($value));
        return is_string($squashed) ? $squashed : trim($value);
    }
}
