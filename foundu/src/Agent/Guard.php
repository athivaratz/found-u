<?php

declare(strict_types=1);

namespace Foundu\Agent;

use Foundu\Auth\Actor;
use Foundu\Data\Feed;
use Foundu\Database;
use Foundu\Ids;
use Foundu\Log;
use PDO;

final class Guard
{
    private const BLOCKED = '/[\x{4E00}-\x{9FFF}\x{3400}-\x{4DBF}\x{F900}-\x{FAFF}\x{3040}-\x{309F}\x{30A0}-\x{30FF}\x{31F0}-\x{31FF}\x{AC00}-\x{D7AF}\x{0600}-\x{06FF}\x{0400}-\x{04FF}\x{0370}-\x{03FF}\x{0590}-\x{05FF}\x{0900}-\x{097F}\x{0980}-\x{09FF}\x{0A00}-\x{0A7F}\x{0B00}-\x{0B7F}\x{0C00}-\x{0C7F}\x{0D00}-\x{0D7F}\x{0E80}-\x{0EFF}\x{0F00}-\x{0FFF}\x{1000}-\x{109F}\x{1100}-\x{11FF}\x{1780}-\x{17FF}\x{1B00}-\x{1B7F}]/u';

    private const INJECTION = '/ignore\s+(all\s+)?(previous|prior|above)\s+instructions|system\s+prompt|reveal\s+(the\s+)?(prompt|tools|contacts)|jailbreak|<\s*\/?\s*system\s*>/i';

    public static function filterText(string $text): string
    {
        if ($text === '') {
            return '';
        }
        $clean = preg_replace(self::BLOCKED, '', $text);
        return is_string($clean) ? $clean : $text;
    }

    public static function blockedScript(string $before, string $after): bool
    {
        return $before !== $after;
    }

    public static function injection(string $text): bool
    {
        return $text !== '' && preg_match(self::INJECTION, $text) === 1;
    }

    public static function looksTruncated(string $text, ?string $finishReason = null): bool
    {
        $text = trim($text);
        if ($text === '') {
            return true;
        }
        if ($finishReason === 'length') {
            return true;
        }
        if (preg_match('/(?:ครับ|ค่ะ|คะ|นะ|ไหม|แล้ว|จ้า|คับ|!|\?|\.|…|\'|\)|\]|😊|🙂|👍|✅|🫤|🧐)$/u', $text) === 1) {
            return false;
        }
        if (preg_match('/[\x{0E01}-\x{0E2E}\x{0E30}-\x{0E3A}\x{0E40}-\x{0E4E}]$/u', $text) === 1 && mb_strlen($text, 'UTF-8') > 30) {
            return true;
        }
        foreach (['ค้', 'หัวข', 'ช่วยค้', 'แถ', 'ที่ย', 'หร', 'ซึ', 'ของหา', 'เลยคร', 'ในระบบเลยคร', 'แจ้งไว้:', ':**', 'สรุป', 'ตรวจ', 'รหัส:**', 'รหัส:'] as $ending) {
            if (str_ends_with($text, $ending)) {
                return true;
            }
        }
        if (preg_match('/(?:LOST|FOUND)-[A-Z0-9]{1,7}$/i', $text) === 1) {
            return true;
        }
        return false;
    }

    public static function inventedCodes(string $text, array $allowed): array
    {
        if (preg_match_all('/(?:LOST|FOUND)-[A-Z0-9]{4,}/i', $text, $found) === false || $found[0] === []) {
            return [];
        }
        $known = [];
        foreach ($allowed as $code) {
            $known[strtoupper($code)] = true;
        }
        $novel = [];
        foreach ($found[0] as $code) {
            $upper = strtoupper($code);
            if (!isset($known[$upper])) {
                $novel[$upper] = true;
            }
        }
        return array_keys($novel);
    }

    public static function cap(array $envelope, int $maxBytes = 4000): array
    {
        $encoded = json_encode($envelope, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if (!is_string($encoded) || strlen($encoded) <= $maxBytes) {
            return $envelope;
        }
        $envelope['data'] = ['_truncated' => true];
        $envelope['message'] = 'ผลจากเครื่องมือถูกตัดให้สั้นลง';
        return $envelope;
    }

    public static function clip(mixed $value, int $max = 400): mixed
    {
        if (is_string($value)) {
            return Prompt::plain($value, $max);
        }
        return $value;
    }

    public static function trip(PDO $pdo, Actor $actor, string $reason): void
    {
        $reason = Prompt::plain($reason, 64);
        if ($reason === '') {
            return;
        }
        Log::get()->warning('agent guard', ['reason' => $reason]);
        if ($pdo->inTransaction()) {
            return;
        }
        try {
            $id = Ids::uuid();
            $details = json_encode(['reason' => $reason], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            Feed::write($pdo, 'activity_logs', static function (PDO $pdo) use ($id, $reason, $details, $actor): void {
                Database::run(
                    $pdo,
                    'INSERT INTO activity_logs (id, action, action_type, target_type, details, user_id)
                     VALUES (?, ?, \'security\', \'system\', ?, ?)',
                    [$id, 'agent guard ' . $reason, $details, $actor->accountId]
                );
            });
        } catch (\Throwable) {
            Log::get()->warning('agent guard row skipped', ['reason' => $reason]);
        }
    }
}
