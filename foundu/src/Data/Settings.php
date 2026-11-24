<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Database;
use Foundu\Http\HttpError;
use PDO;

// The settings document is public. Keys that look like secrets are not
// accepted. AI provider keys live in ai_credentials, not here.
final class Settings
{
    private const DEFAULTS = [
        'ogTitle' => 'Found-U | ระบบแจ้งของหาย-ของเจอ',
        'ogDescription' => 'ระบบแจ้งของหายและของเจอสำหรับโรงเรียน โดยนร.บด.๒ - แจ้งง่าย ติดตามสะดวก',
        'aiRateLimitEnabled' => true,
        'aiRateLimitPerMinute' => 5,
        'aiRateLimitPerHour' => 30,
        'aiRateLimitMessage' => 'คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
        'systemAiRateLimitEnabled' => true,
        'systemAiRateLimitPerMinute' => 20,
        'systemAiRateLimitPerHour' => 100,
        'aiNerModel' => 'gemini-1.5-flash',
        'aiNerTemperature' => 0.1,
        'aiNerTopP' => 0.8,
        'aiNerMaxOutputTokens' => 256,
        'aiMatchingModel' => 'gemini-1.5-flash',
        'aiMatchingTemperature' => 0.1,
        'aiMatchingTopP' => 0.8,
        'aiMatchingMaxOutputTokens' => 200,
        'aiVisionModel' => 'gemini-1.5-flash',
        'aiVisionTemperature' => 0.1,
        'aiVisionTopP' => 0.8,
        'aiVisionMaxOutputTokens' => 256,
        'agentProvider' => 'auto',
        'agentFallbackProvider' => 'openrouter',
        'agentModel' => 'gemini-2.0-flash',
        'agentOpenRouterModel' => 'google/gemini-2.0-flash-exp:free',
        'agentOpenRouterLockProvider' => false,
        'agentOpenRouterProviderOrder' => [],
        'agentOpenRouterAllowFallbacks' => false,
        'agentOpenRouterProviderIgnore' => [],
        'agentOpenRouterReasoningEffort' => 'none',
        'agentOpenRouterProviderSort' => 'latency',
        'agentMaxSteps' => 4,
        'agentMaxOutputTokens' => 2048,
        'agentTemperature' => 0.3,
        'agentContextMaxMessages' => 8,
        'agentContextMaxTokens' => 6000,
        'agentContextStrategy' => 'hybrid',
        'agentMemoryMaxFacts' => 5,
        'searchSimilarityThreshold' => 0.15,
        'mapsEnabled' => true,
        'mapTileUrl' => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        'mapAttribution' => '© OpenStreetMap contributors',
        'mapDefaultCenter' => ['lat' => 13.7563, 'lng' => 100.5018],
        'mapDefaultZoom' => 17,
        'mapSchoolBoundary' => [],
        'mapZones' => [],
        'mapEnforceFoundInSchool' => true,
        'notifyOnNewReport' => true,
        'notifyOnStatusChange' => true,
        'requireApproval' => false,
        'foundHandoverDeadlineEnabled' => true,
        'foundHandoverDeadlineMinutes' => 60,
        'autoDeleteDays' => 30,
        'maxImageSize' => 5,
        'compressionQuality' => 0.8,
        'nfcEnabled' => true,
        'nfcRequireLoginToReport' => true,
        'comingSoonEnabled' => false,
        'comingSoonMessage' => 'พบกันเร็วๆนี้',
    ];

    public static function readFallback(): array
    {
        return self::DEFAULTS;
    }

    public static function handoverMinutes(PDO $pdo): ?int
    {
        $settings = self::read($pdo);
        if (($settings['foundHandoverDeadlineEnabled'] ?? true) !== true) {
            return null;
        }
        $minutes = (int) ($settings['foundHandoverDeadlineMinutes'] ?? 60);
        if ($minutes < 1) {
            return 1;
        }
        return min($minutes, 10080);
    }

    public static function publicFields(PDO $pdo): array
    {
        $settings = self::read($pdo);
        $message = $settings['comingSoonMessage'] ?? 'พบกันเร็วๆนี้';
        if (!is_string($message) || trim($message) === '') {
            $message = 'พบกันเร็วๆนี้';
        }
        return [
            'comingSoonEnabled' => ($settings['comingSoonEnabled'] ?? false) === true,
            'comingSoonMessage' => trim($message),
        ];
    }

    public static function read(PDO $pdo): array
    {
        $row = Database::run(
            $pdo,
            'SELECT settings, updated_at, updated_by FROM app_settings WHERE id = \'default\' LIMIT 1'
        )->fetch();
        $settings = self::DEFAULTS;
        if (!is_array($row)) {
            return $settings;
        }
        $blob = Values::jsonObject($row['settings']);
        if (is_array($blob)) {
            foreach ($blob as $key => $value) {
                if (!is_string($key)) {
                    continue;
                }
                try {
                    $settings[$key] = self::check($key, $value);
                } catch (HttpError) {
                    continue;
                }
            }
        }
        $stamp = Time::iso($row['updated_at'] ?? null);
        if ($stamp !== null) {
            $settings['updatedAt'] = $stamp;
        }
        if (is_string($row['updated_by']) && $row['updated_by'] !== '') {
            $settings['updatedBy'] = $row['updated_by'];
        }
        return $settings;
    }

    public static function save(PDO $pdo, string $adminId, array $patch): array
    {
        if ($patch === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        $clean = [];
        foreach ($patch as $key => $value) {
            if (!is_string($key) || $key === 'updatedAt' || $key === 'updatedBy') {
                throw new HttpError(400, 'invalid_input', ['field' => is_string($key) ? $key : 'body']);
            }
            $clean[$key] = self::check($key, $value);
        }
        $current = self::read($pdo);
        unset($current['updatedAt'], $current['updatedBy']);
        $next = array_merge($current, $clean);
        $json = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        Feed::write($pdo, 'app_settings', static function (PDO $pdo) use ($json, $adminId): void {
            Database::run(
                $pdo,
                'INSERT INTO app_settings (id, settings, updated_by) VALUES (\'default\', ?, ?)
                 ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_by = VALUES(updated_by)',
                [$json, $adminId]
            );
        });
        return self::read($pdo);
    }

    private static function check(string $key, mixed $value): mixed
    {
        $bools = [
            'aiRateLimitEnabled', 'systemAiRateLimitEnabled', 'agentOpenRouterLockProvider',
            'agentOpenRouterAllowFallbacks', 'mapsEnabled', 'mapEnforceFoundInSchool',
            'notifyOnNewReport', 'notifyOnStatusChange', 'requireApproval',
            'foundHandoverDeadlineEnabled', 'nfcEnabled', 'nfcRequireLoginToReport', 'comingSoonEnabled',
        ];
        if (in_array($key, $bools, true)) {
            return Values::bool($value, $key);
        }
        $ints = [
            'aiRateLimitPerMinute' => [1, 1000],
            'aiRateLimitPerHour' => [1, 10000],
            'systemAiRateLimitPerMinute' => [1, 10000],
            'systemAiRateLimitPerHour' => [1, 100000],
            'aiNerMaxOutputTokens' => [16, 8192],
            'aiMatchingMaxOutputTokens' => [16, 8192],
            'aiVisionMaxOutputTokens' => [16, 8192],
            'agentMaxSteps' => [1, 20],
            'agentMaxOutputTokens' => [128, 8192],
            'agentContextMaxMessages' => [1, 100],
            'agentContextMaxTokens' => [100, 100000],
            'agentMemoryMaxFacts' => [0, 100],
            'mapDefaultZoom' => [1, 22],
            'foundHandoverDeadlineMinutes' => [1, 10080],
            'autoDeleteDays' => [0, 3650],
            'maxImageSize' => [1, 20],
        ];
        if (isset($ints[$key])) {
            if (!is_int($value)) {
                throw new HttpError(400, 'invalid_input', ['field' => $key]);
            }
            if ($value < $ints[$key][0] || $value > $ints[$key][1]) {
                throw new HttpError(400, 'invalid_input', ['field' => $key]);
            }
            return $value;
        }
        $floats = [
            'aiNerTemperature' => [0.0, 2.0],
            'aiNerTopP' => [0.0, 1.0],
            'aiMatchingTemperature' => [0.0, 2.0],
            'aiMatchingTopP' => [0.0, 1.0],
            'aiVisionTemperature' => [0.0, 2.0],
            'aiVisionTopP' => [0.0, 1.0],
            'agentTemperature' => [0.0, 2.0],
            'searchSimilarityThreshold' => [0.0, 1.0],
            'compressionQuality' => [0.1, 1.0],
        ];
        if (isset($floats[$key])) {
            return Values::number($value, $key, $floats[$key][0], $floats[$key][1]);
        }
        $enums = [
            'agentProvider' => ['gemini', 'openrouter', 'auto'],
            'agentFallbackProvider' => ['gemini', 'openrouter'],
            'agentOpenRouterReasoningEffort' => ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            'agentOpenRouterProviderSort' => ['price', 'throughput', 'latency'],
            'agentContextStrategy' => ['messages', 'tokens', 'hybrid'],
        ];
        if (isset($enums[$key])) {
            $text = Values::text($value, $key, 32, true);
            if (!in_array($text, $enums[$key], true)) {
                throw new HttpError(400, 'invalid_input', ['field' => $key]);
            }
            return $text;
        }
        $strings = [
            'ogTitle' => 200,
            'ogDescription' => 500,
            'aiRateLimitMessage' => 500,
            'aiNerModel' => 120,
            'aiMatchingModel' => 120,
            'aiVisionModel' => 120,
            'agentModel' => 160,
            'agentOpenRouterModel' => 200,
            'mapAttribution' => 300,
            'comingSoonMessage' => 500,
            'schoolName' => 120,
        ];
        if (isset($strings[$key])) {
            $text = Values::text($value, $key, $strings[$key], true);
            return $text;
        }
        if ($key === 'mapTileUrl' || $key === 'nfcPublicBaseUrl' || $key === 'logoUrl') {
            if ($value === null || $value === '') {
                return null;
            }
            return Values::httpsOrPath($value, $key, true);
        }
        if ($key === 'agentOpenRouterProviderOrder' || $key === 'agentOpenRouterProviderIgnore') {
            return self::stringList($value, $key);
        }
        if ($key === 'mapDefaultCenter') {
            if (!is_array($value) || array_is_list($value)) {
                throw new HttpError(400, 'invalid_input', ['field' => $key]);
            }
            return Values::point($value, $key);
        }
        if ($key === 'mapSchoolBoundary') {
            return self::polygon($value, $key, 200);
        }
        if ($key === 'mapZones') {
            return self::zones($value);
        }
        throw new HttpError(400, 'invalid_input', ['field' => $key]);
    }

    private static function stringList(mixed $value, string $field): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 8) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $out = [];
        foreach ($value as $entry) {
            $out[] = Values::text($entry, $field, 64, true);
        }
        return $out;
    }

    private static function polygon(mixed $value, string $field, int $max): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > $max) {
            throw new HttpError(400, 'invalid_input', ['field' => $field]);
        }
        $out = [];
        foreach ($value as $point) {
            if (!is_array($point) || array_is_list($point)) {
                throw new HttpError(400, 'invalid_input', ['field' => $field]);
            }
            $out[] = Values::point($point, $field);
        }
        return $out;
    }

    private static function zones(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 40) {
            throw new HttpError(400, 'invalid_input', ['field' => 'mapZones']);
        }
        $out = [];
        foreach ($value as $zone) {
            if (!is_array($zone) || array_is_list($zone)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'mapZones']);
            }
            $item = [
                'id' => Values::text($zone['id'] ?? null, 'mapZones', 64, true),
                'name' => Values::text($zone['name'] ?? null, 'mapZones', 120, true),
                'polygon' => self::polygon($zone['polygon'] ?? null, 'mapZones', 200),
            ];
            if (array_key_exists('aliases', $zone)) {
                $item['aliases'] = self::stringList($zone['aliases'], 'mapZones');
            }
            if (array_key_exists('color', $zone) && $zone['color'] !== null) {
                $item['color'] = Values::text($zone['color'], 'mapZones', 32, true);
            }
            $out[] = $item;
        }
        return $out;
    }
}
