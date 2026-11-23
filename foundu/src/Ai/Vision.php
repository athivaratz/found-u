<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Http\HttpError;

final class Vision
{
    private const CATEGORIES = ['wallet', 'phone', 'keys', 'bag', 'electronics', 'documents', 'clothing', 'accessories', 'other'];
    private const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    public static function extract(Generate $generate, Credentials $credentials, string $mime, string $base64, array $settings): ?array
    {
        $generation = [
            'model' => (string) ($settings['aiVisionModel'] ?? 'gemini-1.5-flash'),
            'temperature' => is_numeric($settings['aiVisionTemperature'] ?? null) ? (float) $settings['aiVisionTemperature'] : 0.1,
            'topP' => is_numeric($settings['aiVisionTopP'] ?? null) ? (float) $settings['aiVisionTopP'] : 0.8,
            'maxOutputTokens' => (int) ($settings['aiVisionMaxOutputTokens'] ?? 256),
        ];
        $result = $generate->vision($credentials, Prompts::vision(), $mime, $base64, $generation);
        if ($result === null) {
            return null;
        }
        $parsed = Parse::jsonObject($result->text);
        if ($parsed === null) {
            return null;
        }
        return [
            'data' => self::normalize($parsed),
            'debug' => [
                'model' => $result->model,
                'provider' => $result->provider,
                'generationConfig' => [
                    'temperature' => $generation['temperature'],
                    'topP' => $generation['topP'],
                    'maxOutputTokens' => $generation['maxOutputTokens'],
                ],
                'rawModelText' => $result->text,
                'rawParsedJson' => $parsed,
            ],
        ];
    }

    public static function normalize(array $parsed): array
    {
        $category = (string) ($parsed['category'] ?? '');
        if (!in_array($category, self::CATEGORIES, true)) {
            $category = 'other';
        }
        $confidence = $parsed['confidence'] ?? 'low';
        if (!in_array($confidence, ['low', 'medium', 'high'], true)) {
            $confidence = 'low';
        }
        $name = trim((string) ($parsed['itemName'] ?? ''));
        if ($name === '') {
            $name = $category;
        }
        return [
            'itemName' => $name,
            'category' => $category,
            'color' => self::nullable($parsed['color'] ?? null),
            'brand' => self::nullable($parsed['brand'] ?? null),
            'details' => self::nullable($parsed['details'] ?? null),
            'confidence' => $confidence,
        ];
    }

    public static function form(array $data): array
    {
        return [
            'itemName' => (string) ($data['itemName'] ?? ''),
            'category' => (string) ($data['category'] ?? ''),
            'color' => (string) ($data['color'] ?? ''),
            'brand' => (string) ($data['brand'] ?? ''),
            'description' => (string) ($data['details'] ?? ''),
            'confidence' => (string) ($data['confidence'] ?? ''),
        ];
    }

    public static function image(array $body): array
    {
        $dataUrl = $body['imageDataUrl'] ?? null;
        $base64 = $body['imageBase64'] ?? null;
        $mime = $body['mimeType'] ?? null;
        if (is_string($dataUrl) && $dataUrl !== '') {
            if (preg_match('#^data:(image/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$#', $dataUrl, $match) !== 1) {
                throw new HttpError(400, 'invalid_input', ['field' => 'imageDataUrl']);
            }
            $mime = $match[1] === 'image/jpg' ? 'image/jpeg' : $match[1];
            $base64 = preg_replace('/\s+/', '', $match[2]) ?? '';
        }
        if (!is_string($base64) || $base64 === '' || !is_string($mime)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'image']);
        }
        $mime = strtolower($mime);
        if ($mime === 'image/jpg') {
            $mime = 'image/jpeg';
        }
        if (!in_array($mime, self::MIMES, true)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'mimeType']);
        }
        $base64 = preg_replace('/\s+/', '', $base64) ?? '';
        if ($base64 === '' || strlen($base64) > 1_600_000) {
            throw new HttpError(413, 'payload_too_large');
        }
        $binary = base64_decode($base64, true);
        if (!is_string($binary) || $binary === '' || strlen($binary) > 1_200_000) {
            throw new HttpError(400, 'invalid_input', ['field' => 'image']);
        }
        return [$mime, $base64];
    }

    private static function nullable(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value) && !is_numeric($value)) {
            return null;
        }
        $text = trim((string) $value);
        return $text === '' ? null : $text;
    }
}
