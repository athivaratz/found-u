<?php

declare(strict_types=1);

namespace Foundu\Install;

// A short HTTPS hello. Any HTTP status means the host can leave the network.
// Timeouts stay small so five checks still fit under the 30 second limit.
final class Probe
{
    public static function reach(string $url): bool
    {
        if (!function_exists('curl_init') || strncmp($url, 'https://', 8) !== 0) {
            return false;
        }
        $ch = curl_init($url);
        if ($ch === false) {
            return false;
        }
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'Found-U-install',
        ]);
        curl_exec($ch);
        $errno = curl_errno($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $errno === 0 && $code > 0;
    }
}
