<?php

declare(strict_types=1);

namespace Foundu\Auth;

// guest is the matrix "anon". user and admin come from accounts.role.
// Owner versus someone else is not a role; Authz::permits takes the row.
final class Actor
{
    public const GUEST = 'guest';
    public const USER = 'user';
    public const ADMIN = 'admin';

    public function __construct(
        public readonly string $role,
        public readonly ?string $accountId,
        public readonly ?string $studentId,
        public readonly bool $active,
    ) {
    }

    public static function guest(): self
    {
        return new self(self::GUEST, null, null, false);
    }

    public static function fromAccount(array $row): self
    {
        $role = ($row['role'] ?? '') === self::ADMIN ? self::ADMIN : self::USER;
        $id = isset($row['id']) && is_string($row['id']) ? $row['id'] : null;
        $student = isset($row['student_id']) && is_string($row['student_id']) ? $row['student_id'] : null;
        $active = ($row['status'] ?? '') === 'active' && !self::blocked($row, time());
        return new self($role, $id, $student, $active);
    }

    public function isGuest(): bool
    {
        return $this->role === self::GUEST;
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ADMIN;
    }

    public function atLeast(string $role): bool
    {
        $rank = [self::GUEST => 0, self::USER => 1, self::ADMIN => 2];
        return ($rank[$this->role] ?? -1) >= ($rank[$role] ?? 99);
    }

    // A timeout that has already passed is not a ban. A missing timeout
    // timestamp stays blocked: we do not guess that it expired.
    public static function blocked(array $row, int $now): bool
    {
        $ban = (string) ($row['ban_status'] ?? 'none');
        if ($ban === 'none' || $ban === '') {
            return false;
        }
        if ($ban === 'timeout') {
            $until = $row['timeout_until'] ?? null;
            if (!is_string($until) || $until === '') {
                return true;
            }
            return \Foundu\Ids::unix($until) > $now;
        }
        return true;
    }
}
