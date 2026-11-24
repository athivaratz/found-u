<?php

declare(strict_types=1);

namespace Foundu\Http;

// Secure cookies follow APP_URL and the server's own HTTPS flag.
// X-Forwarded-Proto and CF-Visitor are not read. A visitor can send those.
// On Full (strict) the origin connection is already HTTPS. If a proxy in
// front of PHP speaks plain HTTP, set APP_URL to https:// so the cookie
// still gets Secure and the __Host- name.
final class Https
{
    public static function requested(array $config, array $server): bool
    {
        $url = (string) ($config['APP_URL'] ?? '');
        if (stripos($url, 'https://') === 0) {
            return true;
        }
        $flag = $server['HTTPS'] ?? '';
        return $flag === 'on' || $flag === '1';
    }
}
