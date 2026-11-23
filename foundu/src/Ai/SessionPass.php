<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Auth\SessionRecord;
use Foundu\Auth\SessionService;
use Foundu\Auth\Turnstile;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\ClientAddress;
use Foundu\Http\HttpError;
use Foundu\Ids;
use PDO;
use Psr\Http\Message\ServerRequestInterface;

// One Turnstile pass per browser session, stored on the session row.
// The next AI call inside the window does not ask again. This runs
// before the semaphore lease and before Budget::charge, so a missing
// token does not take a slot and does not write ai_usage.
final class SessionPass
{
    public const WINDOW = 1800;

    public static function ensure(ServerRequestInterface $request, PDO $pdo, array $config, array $body): void
    {
        $turnstile = Turnstile::fromConfig($config);
        if (!$turnstile->enabled()) {
            return;
        }
        $session = $request->getAttribute(Attrs::SESSION);
        if (!$session instanceof SessionRecord || $session->id === '') {
            throw new HttpError(401, 'unauthorized');
        }
        $row = Database::run(
            $pdo,
            'SELECT ai_verified_until FROM sessions WHERE id = ? AND revoked_at IS NULL LIMIT 1',
            [$session->id]
        )->fetch();
        $until = 0;
        if (is_array($row) && is_string($row['ai_verified_until'] ?? null) && $row['ai_verified_until'] !== '') {
            $until = Ids::unix($row['ai_verified_until']);
        }
        if ($until > time()) {
            return;
        }
        $token = '';
        if (is_string($body['turnstileToken'] ?? null)) {
            $token = $body['turnstileToken'];
        }
        if ($token === '') {
            $header = $request->getHeaderLine('X-Turnstile-Token');
            if ($header !== '') {
                $token = $header;
            }
        }
        $client = $request->getAttribute(Attrs::CLIENT);
        $ip = $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
        $result = $turnstile->verify($token, $ip);
        if (!$result->ok) {
            throw new HttpError(403, 'turnstile_required', [
                'message' => 'ยืนยันว่าไม่ใช่บอทก่อนใช้ AI ในรอบนี้',
            ]);
        }
        SessionService::fromConfig($config)->markAiVerified($pdo, $session->id, time() + self::WINDOW);
    }
}
