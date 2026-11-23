<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Config;
use Foundu\Database;
use Foundu\Http\CookieQueue;
use Foundu\Http\HttpError;
use Foundu\Http\SetCookie;
use Foundu\Ids;
use PDO;

final class SessionRecord
{
    public function __construct(
        public readonly string $id,
        public readonly ?string $accountId,
        public readonly string $csrf,
        public readonly int $createdAt,
        public readonly int $expiresAt,
        public readonly ?array $account,
    ) {
    }
}

final class IssuedSession
{
    public function __construct(
        public readonly SessionRecord $record,
        public readonly string $token,
        public readonly array $cookies,
    ) {
    }
}

// The cookie is a random token. The table stores SHA-256 of it.
// Idle expiry moves expires_at forward, but never past created_at plus the
// absolute lifetime. Rotate swaps the token and the CSRF secret and keeps
// the row id. Call it on login and again when the account's privilege
// changes (role, ban, password, PIN).
final class SessionService
{
    private ?CookieQueue $queue = null;

    public function __construct(
        private readonly int $idle,
        private readonly int $absolute,
    ) {
    }

    public static function fromConfig(array $config): self
    {
        $idle = Config::int($config, 'SESSION_IDLE_SECONDS', 1800, 300, 86400);
        $absolute = Config::int($config, 'SESSION_ABSOLUTE_SECONDS', 43200, $idle, 1209600);
        return new self($idle, $absolute);
    }

    public function bind(CookieQueue $queue): void
    {
        $this->queue = $queue;
    }

    public function issue(PDO $pdo, string $accountId, bool $https, int $now, ?string $ip, ?string $userAgent): IssuedSession
    {
        $token = Ids::token();
        $csrf = bin2hex(random_bytes(32));
        $id = Ids::uuid();
        $expires = min($now + $this->idle, $now + $this->absolute);
        Database::run(
            $pdo,
            'INSERT INTO sessions (id, token_hash, account_id, kind, csrf_token, ip, user_agent, created_at, expires_at)
             VALUES (?, ?, ?, \'browser\', ?, ?, ?, ?, ?)',
            [
                $id,
                Ids::sha256($token),
                $accountId,
                $csrf,
                $ip,
                $userAgent !== null ? substr($userAgent, 0, 255) : null,
                Ids::utc($now),
                Ids::utc($expires),
            ]
        );
        $record = new SessionRecord($id, $accountId, $csrf, $now, $expires, null);
        return $this->pack($record, $token, $https, $now);
    }

    public function open(PDO $pdo, string $token, int $now): ?SessionRecord
    {
        if ($token === '' || strlen($token) > 128) {
            return null;
        }
        $row = Database::run(
            $pdo,
            'SELECT s.id, s.account_id, s.csrf_token, s.created_at, s.expires_at, s.revoked_at,
                    a.id AS account_row_id, a.role, a.student_id, a.status, a.ban_status, a.linked_uid, a.email
             FROM sessions s
             LEFT JOIN accounts a ON a.id = s.account_id
             WHERE s.token_hash = ? AND s.kind = \'browser\'
             LIMIT 1',
            [Ids::sha256($token)]
        )->fetch();
        if (!is_array($row) || $row['revoked_at'] !== null) {
            return null;
        }
        $created = Ids::unix((string) $row['created_at']);
        $expires = Ids::unix((string) $row['expires_at']);
        if ($created < 1 || $expires <= $now || ($created + $this->absolute) <= $now) {
            return null;
        }
        $account = null;
        if (is_string($row['account_row_id']) && $row['account_row_id'] !== '') {
            $account = [
                'id' => $row['account_row_id'],
                'role' => $row['role'],
                'student_id' => $row['student_id'],
                'status' => $row['status'],
                'ban_status' => $row['ban_status'],
                'linked_uid' => $row['linked_uid'],
                'email' => $row['email'],
            ];
        }
        $record = new SessionRecord(
            (string) $row['id'],
            is_string($row['account_id']) ? $row['account_id'] : null,
            (string) $row['csrf_token'],
            $created,
            $expires,
            $account
        );
        $this->touch($pdo, $record, $now);
        return $record;
    }

    public function rotate(PDO $pdo, string $sessionId, bool $https, int $now): IssuedSession
    {
        $current = Database::run(
            $pdo,
            'SELECT id, account_id, created_at, revoked_at FROM sessions WHERE id = ? AND kind = \'browser\' LIMIT 1',
            [$sessionId]
        )->fetch();
        if (!is_array($current) || $current['revoked_at'] !== null) {
            throw new HttpError(401, 'unauthorized');
        }
        $created = Ids::unix((string) $current['created_at']);
        if (($created + $this->absolute) <= $now) {
            throw new HttpError(401, 'unauthorized');
        }
        $token = Ids::token();
        $csrf = bin2hex(random_bytes(32));
        $expires = min($now + $this->idle, $created + $this->absolute);
        $updated = Database::run(
            $pdo,
            'UPDATE sessions SET token_hash = ?, csrf_token = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL',
            [Ids::sha256($token), $csrf, Ids::utc($expires), $sessionId]
        );
        if ($updated->rowCount() < 1) {
            throw new HttpError(401, 'unauthorized');
        }
        $record = new SessionRecord(
            $sessionId,
            is_string($current['account_id']) ? $current['account_id'] : null,
            $csrf,
            $created,
            $expires,
            null
        );
        return $this->pack($record, $token, $https, $now);
    }

    public function revoke(PDO $pdo, string $sessionId, bool $https, int $now): void
    {
        Database::run(
            $pdo,
            'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
            [Ids::utc($now), $sessionId]
        );
        $this->emit([
            SetCookie::line(SetCookie::sessionName($https), '', 0, $https, true),
            SetCookie::line(SetCookie::csrfName($https), '', 0, $https, false),
        ]);
    }

    public function markAiVerified(PDO $pdo, string $sessionId, int $until): void
    {
        Database::run(
            $pdo,
            'UPDATE sessions SET ai_verified_until = ? WHERE id = ? AND revoked_at IS NULL',
            [Ids::utc($until), $sessionId]
        );
    }

    public function clearCookies(bool $https): void
    {
        $this->emit([
            SetCookie::line(SetCookie::sessionName($https), '', 0, $https, true),
            SetCookie::line(SetCookie::csrfName($https), '', 0, $https, false),
        ]);
    }

    private function touch(PDO $pdo, SessionRecord $record, int $now): void
    {
        $cap = $record->createdAt + $this->absolute;
        $refreshAfter = $record->expiresAt - $this->idle + 60;
        if ($now < $refreshAfter || $record->expiresAt >= $cap) {
            return;
        }
        $expires = min($now + $this->idle, $cap);
        Database::run(
            $pdo,
            'UPDATE sessions SET expires_at = ? WHERE id = ? AND revoked_at IS NULL',
            [Ids::utc($expires), $record->id]
        );
    }

    private function pack(SessionRecord $record, string $token, bool $https, int $now): IssuedSession
    {
        $life = max(0, ($record->createdAt + $this->absolute) - $now);
        $cookies = [
            SetCookie::line(SetCookie::sessionName($https), $token, $life, $https, true),
            SetCookie::line(SetCookie::csrfName($https), $record->csrf, $life, $https, false),
        ];
        $issued = new IssuedSession($record, $token, $cookies);
        $this->emit($cookies);
        return $issued;
    }

    private function emit(array $lines): void
    {
        if ($this->queue !== null) {
            $this->queue->addAll($lines);
        }
    }
}
