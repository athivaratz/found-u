<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Http\HttpError;

// sodium_crypto_secretbox. The master key is SHA-256(APP_KEY), so a short
// or hex env string still becomes the 32 bytes libsodium wants. Ciphertext
// is the box including the 16-byte MAC. The nonce is stored beside it and
// is never reused for a new write.
final class SecretBox
{
    public static function key(array $config): string
    {
        $raw = (string) ($config['APP_KEY'] ?? '');
        if (strlen($raw) < 16) {
            throw new HttpError(503, 'server_error');
        }
        return hash('sha256', $raw, true);
    }

    public static function seal(string $plain, string $key): array
    {
        if (strlen($plain) > 512) {
            throw new HttpError(400, 'invalid_input', ['field' => 'apiKey']);
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $box = sodium_crypto_secretbox($plain, $nonce, $key);
        return ['nonce' => $nonce, 'cipher' => $box];
    }

    public static function open(string $cipher, string $nonce, string $key): ?string
    {
        if (strlen($nonce) !== SODIUM_CRYPTO_SECRETBOX_NONCEBYTES || $cipher === '') {
            return null;
        }
        $plain = sodium_crypto_secretbox_open($cipher, $nonce, $key);
        if (!is_string($plain) || $plain === '') {
            return null;
        }
        return $plain;
    }
}
