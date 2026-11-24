<?php

declare(strict_types=1);

namespace Foundu\Match;

use Foundu\Ai\Credentials;
use Foundu\Ai\Generate;
use Foundu\Ai\Parse;
use Foundu\Ai\Prompts;
use Foundu\Http\HttpError;

final class Suggest
{
    public static function one(
        \PDO $pdo,
        string $type,
        string $id,
        bool $useAI,
        ?Generate $generate,
        ?Credentials $credentials,
        array $settings,
    ): array {
        $zones = self::zones($settings);
        $dismissed = Store::dismissed($pdo);
        if ($type === 'lost') {
            $item = Store::lost($pdo, $id);
            if ($item === null) {
                throw new HttpError(404, 'Item not found');
            }
            $matches = Engine::forLost($item, Store::matchableFound($pdo, $item['dateLost'] ?? null), $zones);
        } elseif ($type === 'found') {
            $item = Store::found($pdo, $id);
            if ($item === null) {
                throw new HttpError(404, 'Item not found');
            }
            $matches = Engine::forFound($item, Store::matchableLost($pdo, $item['dateFound'] ?? null), $zones);
        } else {
            throw new HttpError(400, 'invalid_input', ['field' => 'type']);
        }
        if ($useAI) {
            $matches = self::rerank($matches, $generate, $credentials, $settings);
        }
        return self::publish($matches, $dismissed);
    }

    public static function batch(
        \PDO $pdo,
        bool $useAI,
        ?Generate $generate,
        ?Credentials $credentials,
        array $settings,
    ): array {
        $zones = self::zones($settings);
        $dismissed = Store::dismissed($pdo);
        $lostItems = Store::matchableLost($pdo, null);
        $foundItems = Store::matchableFound($pdo, null);
        $considered = $useAI ? array_slice($lostItems, 0, 8) : $lostItems;
        $seen = [];
        $matches = [];
        foreach ($considered as $lost) {
            $itemMatches = Engine::forLost($lost, $foundItems, $zones);
            if ($useAI) {
                $itemMatches = self::rerank($itemMatches, $generate, $credentials, $settings);
            }
            foreach ($itemMatches as $match) {
                $key = $match['lostItem']['id'] . '_' . $match['foundItem']['id'];
                if (isset($seen[$key]) || isset($dismissed[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $matches[] = $match;
            }
        }
        usort($matches, static function (array $a, array $b): int {
            $delta = $a['score'] - $b['score'];
            return abs($delta) > 1e-9 ? ($delta < 0 ? 1 : -1) : strcmp($a['lostItem']['id'], $b['lostItem']['id']);
        });
        $formatted = [];
        foreach ($matches as $match) {
            $formatted[] = Engine::format($match);
        }
        $high = 0;
        foreach ($formatted as $match) {
            if ($match['confidence'] === 'high') {
                $high++;
            }
        }
        return [
            'matches' => $formatted,
            'pool' => [
                'lost' => count($lostItems),
                'found' => count($foundItems),
                'highConfidence' => $high,
            ],
        ];
    }

    private static function publish(array $matches, array $dismissed): array
    {
        $out = [];
        foreach ($matches as $match) {
            $key = $match['lostItem']['id'] . '_' . $match['foundItem']['id'];
            if (isset($dismissed[$key])) {
                continue;
            }
            $out[] = Engine::format($match);
        }
        return $out;
    }

    private static function rerank(array $matches, ?Generate $generate, ?Credentials $credentials, array $settings): array
    {
        if ($generate === null || $credentials === null || $credentials->order() === []) {
            return [];
        }
        $generation = [
            'model' => (string) ($settings['aiMatchingModel'] ?? 'gemini-1.5-flash'),
            'temperature' => is_numeric($settings['aiMatchingTemperature'] ?? null) ? (float) $settings['aiMatchingTemperature'] : 0.1,
            'topP' => is_numeric($settings['aiMatchingTopP'] ?? null) ? (float) $settings['aiMatchingTopP'] : 0.8,
            'maxOutputTokens' => (int) ($settings['aiMatchingMaxOutputTokens'] ?? 200),
        ];
        $deadline = microtime(true) + 20;
        $kept = [];
        foreach (array_slice($matches, 0, Engine::AI_CANDIDATES) as $match) {
            if (microtime(true) > $deadline) {
                break;
            }
            $result = $generate->text($credentials, Prompts::match($match['lostItem'], $match['foundItem']), $generation, 8);
            if ($result === null) {
                continue;
            }
            $parsed = Parse::jsonObject($result->text);
            if ($parsed === null) {
                continue;
            }
            $applied = Engine::applyAi($match, [
                'score' => $parsed['score'] ?? 0,
                'reasons' => is_array($parsed['reasons'] ?? null) ? $parsed['reasons'] : [],
                'isMatch' => ($parsed['isMatch'] ?? false) === true,
            ]);
            if ($applied !== null) {
                $kept[] = $applied;
            }
        }
        usort($kept, static function (array $a, array $b): int {
            $delta = $a['score'] - $b['score'];
            return abs($delta) > 1e-9 ? ($delta < 0 ? 1 : -1) : 0;
        });
        return $kept;
    }

    public static function zones(array $settings): array
    {
        $raw = $settings['mapZones'] ?? [];
        if (!is_array($raw)) {
            return [];
        }
        $zones = [];
        foreach ($raw as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $id = trim((string) ($entry['id'] ?? ''));
            $name = trim((string) ($entry['name'] ?? ''));
            if ($id === '' || $name === '') {
                continue;
            }
            $polygon = [];
            foreach ($entry['polygon'] ?? [] as $point) {
                if (is_array($point) && isset($point['lat'], $point['lng']) && is_numeric($point['lat']) && is_numeric($point['lng'])) {
                    $polygon[] = ['lat' => (float) $point['lat'], 'lng' => (float) $point['lng']];
                }
            }
            $aliases = [];
            foreach ($entry['aliases'] ?? [] as $alias) {
                if (is_string($alias) && trim($alias) !== '') {
                    $aliases[] = trim($alias);
                }
            }
            $zones[] = ['id' => $id, 'name' => $name, 'aliases' => $aliases, 'polygon' => $polygon];
        }
        return $zones;
    }
}
