<?php

declare(strict_types=1);

namespace Foundu\Http;

final class JsonBody
{
    public const DEFAULT_MAX = 262144;
    public const AI_MAX = 65536;
    public const VISION_MAX = 1572864;
    public const MAX_DEPTH = 16;

    public static function decode(string $raw, int $maxBytes, int $depth = self::MAX_DEPTH): array
    {
        if (strlen($raw) > $maxBytes) {
            throw new HttpError(413, 'payload_too_large');
        }
        try {
            // Invalid UTF-8 already fails json_decode. IGNORE and SUBSTITUTE
            // are the only flags, and both would accept bytes we do not want.
            $data = json_decode($raw, true, $depth, \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpError(400, 'invalid_json');
        }
        if (!is_array($data)) {
            throw new HttpError(400, 'invalid_json');
        }
        if (array_is_list($data) && $data !== []) {
            throw new HttpError(400, 'invalid_json');
        }
        return $data;
    }

    public static function accepts(string $contentType): bool
    {
        $type = strtolower(trim($contentType));
        return preg_match('#^application/json(?:\s*;\s*charset=utf-8)?$#', $type) === 1;
    }

    public static function maxFor(string $path, int $normal, int $ai): int
    {
        $path = strtolower($path);
        // A compressed photo does not fit in the 64 KiB AI cap. Vision is
        // the exception. Ner, the agent, and other AI posts stay small.
        if ($path === '/vision' || str_starts_with($path, '/vision/')) {
            return self::VISION_MAX;
        }
        foreach (['/agent', '/ai', '/ner'] as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
                return min($ai, $normal);
            }
        }
        return $normal;
    }
}
