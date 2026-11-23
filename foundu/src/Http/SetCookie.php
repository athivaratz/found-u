<?php

declare(strict_types=1);

namespace Foundu\Http;

final class SetCookie
{
    public static function line(string $name, string $value, int $maxAge, bool $https, bool $httpOnly): string
    {
        $parts = [
            $name . '=' . $value,
            'Path=/',
            'Max-Age=' . max(0, $maxAge),
            'SameSite=Lax',
        ];
        if ($httpOnly) {
            $parts[] = 'HttpOnly';
        }
        if ($https) {
            $parts[] = 'Secure';
        }
        return implode('; ', $parts);
    }

    public static function sessionName(bool $https): string
    {
        return $https ? '__Host-foundu' : 'foundu';
    }

    public static function csrfName(bool $https): string
    {
        return $https ? '__Host-foundu-csrf' : 'foundu_csrf';
    }
}
