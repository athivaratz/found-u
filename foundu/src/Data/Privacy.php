<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\Actor;

// Phone, Line, and the reporter's student id stay with the owner and
// with an admin. A guest or another student still sees the item.
final class Privacy
{
    public static function item(array $item, Actor $actor, string $kind): array
    {
        if (self::sees($actor, $item)) {
            return $item;
        }
        if ($kind === 'found') {
            $item['finderContacts'] = [];
        } else {
            $item['contacts'] = [];
            $item['studentId'] = null;
        }
        return $item;
    }

    public static function pair(array $match, Actor $actor): array
    {
        if (isset($match['lostItem']) && is_array($match['lostItem'])) {
            $match['lostItem'] = self::item($match['lostItem'], $actor, 'lost');
        }
        if (isset($match['foundItem']) && is_array($match['foundItem'])) {
            $match['foundItem'] = self::item($match['foundItem'], $actor, 'found');
        }
        return $match;
    }

    public static function sees(Actor $actor, array $item): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        $owner = $item['userId'] ?? null;
        return is_string($actor->accountId) && $actor->accountId !== '' && $owner === $actor->accountId;
    }
}
