<?php

declare(strict_types=1);

namespace Foundu\Agent;

// Owner rows keep the id and the tracking code. Everyone else gets the
// public catalog fields only. Contacts, student ids, and user ids never
// leave this class, including for the owner: the model does not need them.
final class Privacy
{
    public static function lost(array $item, bool $owner): array
    {
        $row = [
            'type' => 'lost',
            'visibility' => $owner ? 'owner' : 'public',
            'itemName' => Guard::clip($item['itemName'] ?? null),
            'category' => Guard::clip($item['category'] ?? null, 64),
            'description' => Guard::clip($item['description'] ?? null),
            'location' => Guard::clip($item['locationLost'] ?? null),
            'locationPlaceName' => Guard::clip($item['locationPlaceName'] ?? null),
            'status' => Guard::clip($item['status'] ?? null, 32),
            'dateLost' => is_string($item['dateLost'] ?? null) ? $item['dateLost'] : null,
        ];
        if ($owner) {
            $row['id'] = is_string($item['id'] ?? null) ? $item['id'] : null;
            $row['trackingCode'] = is_string($item['trackingCode'] ?? null) ? $item['trackingCode'] : null;
            $row['matchedFoundId'] = is_string($item['matchedFoundId'] ?? null) ? $item['matchedFoundId'] : null;
        }
        return $row;
    }

    public static function found(array $item, bool $owner): array
    {
        $row = [
            'type' => 'found',
            'visibility' => $owner ? 'owner' : 'public',
            'itemName' => Guard::clip($item['itemName'] ?? null),
            'category' => Guard::clip($item['category'] ?? null, 64),
            'description' => Guard::clip($item['description'] ?? null),
            'location' => Guard::clip($item['locationFound'] ?? null),
            'locationPlaceName' => Guard::clip($item['locationPlaceName'] ?? null),
            'photoUrl' => is_string($item['photoUrl'] ?? null) ? Guard::clip($item['photoUrl'], 200) : null,
            'status' => Guard::clip($item['status'] ?? null, 32),
            'dateFound' => is_string($item['dateFound'] ?? null) ? $item['dateFound'] : null,
        ];
        if ($owner) {
            $row['id'] = is_string($item['id'] ?? null) ? $item['id'] : null;
            $row['trackingCode'] = is_string($item['trackingCode'] ?? null) ? $item['trackingCode'] : null;
            $row['matchedLostId'] = is_string($item['matchedLostId'] ?? null) ? $item['matchedLostId'] : null;
        }
        return $row;
    }

    public static function lostLookup(array $item, bool $owner): array
    {
        $row = self::lost($item, $owner);
        if (!$owner && is_string($item['trackingCode'] ?? null)) {
            $row['trackingCode'] = $item['trackingCode'];
        }
        return $row;
    }

    public static function owns(array $item, ?string $accountId, bool $admin): bool
    {
        if ($admin) {
            return true;
        }
        return is_string($accountId) && $accountId !== '' && ($item['userId'] ?? null) === $accountId;
    }
}
