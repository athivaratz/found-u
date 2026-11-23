<?php

declare(strict_types=1);

namespace Foundu\Ai;

final class Parse
{
    public static function jsonObject(string $raw): ?array
    {
        $trimmed = trim($raw);
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $trimmed, $fence) === 1) {
            $trimmed = trim($fence[1]);
        }
        if (preg_match('/\{[\s\S]*\}/', $trimmed, $match) !== 1) {
            return null;
        }
        try {
            $decoded = json_decode($match[0], true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        return is_array($decoded) && !array_is_list($decoded) ? $decoded : null;
    }

    public static function geminiText(string $body): ?string
    {
        try {
            $decoded = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
        return is_string($text) && $text !== '' ? $text : null;
    }

    public static function openRouterText(string $body): ?string
    {
        try {
            $decoded = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        $text = $decoded['choices'][0]['message']['content'] ?? null;
        return is_string($text) && $text !== '' ? $text : null;
    }
}
