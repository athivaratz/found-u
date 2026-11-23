<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Foundu\Http\HttpError;

// The cells from docs/php-port/authz-matrix.md, keyed the way routes ask.
// Unknown tables are denied. Server-only tables are denied here too: a route
// that is allowed to write them does that after its own check, it does not
// get a bypass flag from this class.
//
// accounts update for the owner means the profile columns only. The trigger
// rejects the locked ones unless the route used Database::privileged, and
// the route still must not copy a request body onto those columns.
// Selecting app_settings or a help page is allowed for a guest. The public
// routes still return the small shape in the contract, not the whole row.
final class Authz
{
    public static function requireRole(Actor $actor, string $role): void
    {
        if ($role === Actor::GUEST) {
            return;
        }
        if ($actor->isGuest() || !$actor->atLeast($role) || !$actor->active) {
            $status = $actor->isGuest() ? 401 : 403;
            $error = $actor->isGuest() ? 'unauthorized' : 'forbidden';
            throw new HttpError($status, $error);
        }
    }

    public static function permits(string $table, string $op, Actor $actor, array $row = []): bool
    {
        $op = strtolower($op);
        if (!in_array($op, ['select', 'insert', 'update', 'delete'], true)) {
            return false;
        }
        return match (strtolower($table)) {
            'accounts' => self::accounts($op, $actor, $row),
            'admin_whitelist' => $actor->isAdmin() && $actor->active,
            'lost_items' => self::items($op, $actor, $row),
            'found_items' => self::items($op, $actor, $row),
            'categories', 'locations', 'contact_types', 'drop_off_locations', 'app_settings',
            'help_pages', 'help_sections' => self::catalog($op, $actor),
            'articles' => self::articles($op, $actor, $row),
            'activity_logs' => self::activity($op, $actor),
            'error_logs' => self::errors($op, $actor),
            'ai_usage' => self::usage($op, $actor, $row),
            'agent_chat_logs' => self::agentLogs($op, $actor),
            'match_dismissals' => $actor->isAdmin() && $actor->active,
            'nfc_tags' => self::tags($op, $actor, $row),
            'nfc_found_reports' => self::reports($op, $actor, $row),
            default => false,
        };
    }

    private static function accounts(string $op, Actor $actor, array $row): bool
    {
        if ($op === 'select') {
            return ($actor->isAdmin() && $actor->active) || self::same($actor, $row['id'] ?? null) || self::same($actor, $row['linked_uid'] ?? null);
        }
        if ($op === 'update') {
            return ($actor->isAdmin() && $actor->active) || self::same($actor, $row['id'] ?? null);
        }
        return false;
    }

    private static function items(string $op, Actor $actor, array $row): bool
    {
        if ($op === 'select') {
            return true;
        }
        if (!$actor->active) {
            return false;
        }
        if ($op === 'insert') {
            // The route passes the user_id it is about to write. A student
            // only gets here when that id is their own. Admin routes insert
            // as the server after this check.
            return $actor->isAdmin() || self::same($actor, $row['user_id'] ?? null);
        }
        return $actor->isAdmin() && ($op === 'update' || $op === 'delete');
    }

    private static function catalog(string $op, Actor $actor): bool
    {
        if ($op === 'select') {
            return true;
        }
        return $actor->isAdmin() && $actor->active;
    }

    private static function articles(string $op, Actor $actor, array $row): bool
    {
        if ($actor->isAdmin() && $actor->active) {
            return true;
        }
        return $op === 'select' && ($row['status'] ?? '') === 'published';
    }

    private static function activity(string $op, Actor $actor): bool
    {
        if (!$actor->active) {
            return false;
        }
        if ($op === 'select') {
            return $actor->isAdmin();
        }
        return $op === 'insert';
    }

    private static function errors(string $op, Actor $actor): bool
    {
        if (!$actor->active) {
            return false;
        }
        if ($op === 'select' || $op === 'update') {
            return $actor->isAdmin();
        }
        return $op === 'insert';
    }

    private static function usage(string $op, Actor $actor, array $row): bool
    {
        if (!$actor->active) {
            return false;
        }
        $mine = self::same($actor, $row['user_id'] ?? null);
        if ($op === 'select') {
            return $actor->isAdmin() || $mine;
        }
        return $op === 'insert' && $mine;
    }

    private static function agentLogs(string $op, Actor $actor): bool
    {
        if (!$actor->isAdmin() || !$actor->active) {
            return false;
        }
        return $op === 'select' || $op === 'delete';
    }

    private static function tags(string $op, Actor $actor, array $row): bool
    {
        if (!$actor->active) {
            return false;
        }
        $mine = self::same($actor, $row['owner_id'] ?? null);
        if ($op === 'select' || $op === 'update') {
            return $actor->isAdmin() || $mine;
        }
        if ($op === 'insert') {
            return $mine;
        }
        return $actor->isAdmin();
    }

    private static function reports(string $op, Actor $actor, array $row): bool
    {
        if (!$actor->active) {
            return false;
        }
        $owner = self::same($actor, $row['owner_id'] ?? null);
        $finder = self::same($actor, $row['finder_user_id'] ?? null);
        if ($op === 'select') {
            return $actor->isAdmin() || $owner || $finder;
        }
        if ($op === 'insert') {
            return $finder;
        }
        if ($op === 'update') {
            return $actor->isAdmin() || $owner;
        }
        return $actor->isAdmin();
    }

    private static function same(Actor $actor, mixed $id): bool
    {
        if ($actor->accountId === null || !is_string($id) || strlen($id) !== strlen($actor->accountId)) {
            return false;
        }
        return hash_equals($actor->accountId, $id);
    }
}
