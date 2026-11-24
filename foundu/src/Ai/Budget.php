<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Auth\Actor;
use Foundu\Http\HttpError;
use PDO;

// One semaphore lease around the upstream work, then one quota row for the
// request. A full queue is a Thai 429 and does not call the provider and
// does not spend quota. Quota itself is the per-account and system cap.
final class Budget
{
    public function __construct(
        private readonly Semaphore $semaphore,
        private readonly int $max,
        private readonly int $leaseSeconds,
    ) {
    }

    public static function fromConfig(array $config): self
    {
        return new self(new Semaphore(), Semaphore::maxFrom($config), Semaphore::leaseFrom($config));
    }

    public function lease(PDO $pdo, ?string $accountId, int $now): string
    {
        $token = $this->semaphore->acquire($pdo, $accountId, $this->max, $this->leaseSeconds, $now);
        if ($token === null) {
            throw new HttpError(
                429,
                'rate_limit_exceeded',
                [
                    'reason' => 'queue_full',
                    'message' => Semaphore::FULL_MESSAGE,
                    'userRemainingMinute' => 0,
                    'userRemainingHour' => 0,
                    'systemRemainingMinute' => 0,
                    'systemRemainingHour' => 0,
                    'resetMinute' => gmdate('Y-m-d\TH:i:s\Z', $now + 5),
                    'resetHour' => gmdate('Y-m-d\TH:i:s\Z', $now + 60),
                ],
                ['Retry-After' => '5']
            );
        }
        return $token;
    }

    public function release(PDO $pdo, string $token): void
    {
        $this->semaphore->release($pdo, $token);
    }

    public function charge(PDO $pdo, Actor $actor, string $endpoint, array $settings, bool $skip, int $now): QuotaResult
    {
        if ($actor->accountId === null) {
            throw new HttpError(401, 'unauthorized');
        }
        // Admin vision test mode does not spend a quota row. A disabled
        // limit still records the call so the usage page can see it.
        if ($skip) {
            return new QuotaResult(true, null, 0, 0, 0, 0, $now + 60, $now + 3600);
        }
        if (($settings['aiRateLimitEnabled'] ?? true) !== true) {
            $quota = Quota::fromConfig([
                'AI_QUOTA_PER_MINUTE' => 100000,
                'AI_QUOTA_PER_HOUR' => 100000,
                'AI_SYSTEM_QUOTA_PER_MINUTE' => 100000,
                'AI_SYSTEM_QUOTA_PER_HOUR' => 100000,
            ]);
            $quota->record($pdo, $actor->accountId, $endpoint, $now);
            return new QuotaResult(true, null, 100000, 100000, 100000, 100000, $now + 60, $now + 3600);
        }
        $systemOn = ($settings['systemAiRateLimitEnabled'] ?? true) === true;
        $quota = new Quota(
            self::bound($settings['aiRateLimitPerMinute'] ?? 5, 5, 1, 10000),
            self::bound($settings['aiRateLimitPerHour'] ?? 30, 30, 1, 100000),
            $systemOn ? self::bound($settings['systemAiRateLimitPerMinute'] ?? 20, 20, 1, 100000) : 1000000,
            $systemOn ? self::bound($settings['systemAiRateLimitPerHour'] ?? 100, 100, 1, 1000000) : 1000000,
        );
        $result = $quota->allowAndRecord($pdo, $actor->accountId, $endpoint, $now);
        if (!$result->allowed) {
            throw self::denied($result, $settings, $now);
        }
        return $result;
    }

    public static function denied(QuotaResult $result, array $settings, int $now): HttpError
    {
        $message = (string) ($settings['aiRateLimitMessage'] ?? 'คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
        if ($result->reason === 'system_minute') {
            $message = 'AI system is busy. Please try again shortly.';
        } elseif ($result->reason === 'system_hour') {
            $message = 'AI system hourly limit reached. Please try again later.';
        } elseif ($result->reason === 'busy' || $result->reason === 'queue_full') {
            $message = Semaphore::FULL_MESSAGE;
        }
        $reset = ($result->reason === 'user_hour' || $result->reason === 'system_hour') ? $result->resetHour : $result->resetMinute;
        $retry = max(1, $reset - $now);
        return new HttpError(
            429,
            'rate_limit_exceeded',
            [
                'reason' => $result->reason ?? 'user_minute',
                'message' => $message,
                'userRemainingMinute' => $result->userRemainingMinute,
                'userRemainingHour' => $result->userRemainingHour,
                'systemRemainingMinute' => $result->systemRemainingMinute,
                'systemRemainingHour' => $result->systemRemainingHour,
                'resetMinute' => gmdate('Y-m-d\TH:i:s\Z', $result->resetMinute),
                'resetHour' => gmdate('Y-m-d\TH:i:s\Z', $result->resetHour),
            ],
            ['Retry-After' => (string) min($retry, 3600)]
        );
    }

    public static function snapshot(PDO $pdo, string $userId, array $settings, int $now): array
    {
        if (($settings['aiRateLimitEnabled'] ?? true) !== true) {
            return [
                'enabled' => false,
                'userRemainingMinute' => null,
                'userRemainingHour' => null,
                'systemRemainingMinute' => null,
                'systemRemainingHour' => null,
            ];
        }
        $systemOn = ($settings['systemAiRateLimitEnabled'] ?? true) === true;
        $quota = new Quota(
            self::bound($settings['aiRateLimitPerMinute'] ?? 5, 5, 1, 10000),
            self::bound($settings['aiRateLimitPerHour'] ?? 30, 30, 1, 100000),
            $systemOn ? self::bound($settings['systemAiRateLimitPerMinute'] ?? 20, 20, 1, 100000) : 1000000,
            $systemOn ? self::bound($settings['systemAiRateLimitPerHour'] ?? 100, 100, 1, 1000000) : 1000000,
        );
        $result = $quota->check($pdo, $userId, $now);
        return [
            'enabled' => true,
            'userRemainingMinute' => $result->userRemainingMinute,
            'userRemainingHour' => $result->userRemainingHour,
            'userLimitPerMinute' => self::bound($settings['aiRateLimitPerMinute'] ?? 5, 5, 1, 10000),
            'userLimitPerHour' => self::bound($settings['aiRateLimitPerHour'] ?? 30, 30, 1, 100000),
            'systemRemainingMinute' => $systemOn ? $result->systemRemainingMinute : null,
            'systemRemainingHour' => $systemOn ? $result->systemRemainingHour : null,
            'systemLimitPerMinute' => $systemOn ? self::bound($settings['systemAiRateLimitPerMinute'] ?? 20, 20, 1, 100000) : null,
            'systemLimitPerHour' => $systemOn ? self::bound($settings['systemAiRateLimitPerHour'] ?? 100, 100, 1, 1000000) : null,
        ];
    }

    private static function bound(mixed $value, int $default, int $min, int $max): int
    {
        if (!is_numeric($value)) {
            $value = $default;
        }
        $value = (int) $value;
        if ($value < $min) {
            return $min;
        }
        if ($value > $max) {
            return $max;
        }
        return $value;
    }
}
