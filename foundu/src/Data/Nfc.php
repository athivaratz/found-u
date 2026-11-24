<?php

declare(strict_types=1);

namespace Foundu\Data;

use Foundu\Auth\Authz;
use Foundu\Database;
use Foundu\Http\Attrs;
use Foundu\Http\ClientAddress;
use Foundu\Http\HttpError;
use Foundu\Ids;
use Foundu\RateLimit\Limiter;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// NFC tags and found reports. Public resolve never returns contacts.
// A student can read and change their own tag, and can file a report on
// someone else's. owner_id is taken from the session, not the body.
final class Nfc
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function register(App $app, array $config, \Closure $pdo, Limiter $limiter): void
    {
        $app->get('/nfc/resolve', static function ($request, $response) use ($pdo) {
            return self::resolve($request, $response, Gate::db($pdo));
        });
        $app->get('/nfc/my-tags', static function ($request, $response) use ($pdo) {
            return self::mine($request, $response, Gate::db($pdo));
        });
        $app->post('/nfc/register', static function ($request, $response) use ($config, $pdo, $limiter) {
            return self::registerTag($request, $response, Gate::db($pdo), $config, $limiter);
        });
        $app->post('/nfc/found', static function ($request, $response) use ($pdo, $limiter) {
            return self::found($request, $response, Gate::db($pdo), $limiter, true);
        });
        $app->get('/nfc/tags', static function ($request, $response) use ($pdo) {
            return self::listTags($request, $response, Gate::db($pdo));
        });
        $app->get('/nfc/tags/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::oneTag($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->patch('/nfc/tags/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::patchTag($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->post('/nfc/found-reports', static function ($request, $response) use ($pdo, $limiter) {
            return self::found($request, $response, Gate::db($pdo), $limiter, false);
        });
        $app->get('/nfc/found-reports', static function ($request, $response) use ($pdo) {
            return self::listReports($request, $response, Gate::db($pdo));
        });
        $app->patch('/nfc/found-reports/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::patchReport($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
        $app->patch('/nfc/reports/{id}', static function ($request, $response, array $args) use ($pdo) {
            return self::patchReport($request, $response, Gate::db($pdo), (string) ($args['id'] ?? ''));
        });
    }

    private static function resolve(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $tag = trim((string) ($request->getQueryParams()['tag'] ?? ''));
        if ($tag === '') {
            throw new HttpError(400, 'tag parameter required');
        }
        $id = self::tagId($tag);
        $row = self::tagRow($pdo, $id, false);
        if ($row === null || (string) $row['status'] === 'disabled') {
            throw new HttpError(404, 'tag_not_found');
        }
        $actor = Gate::actor($request);
        $isOwner = $actor->accountId !== null && hash_equals((string) $row['owner_id'], $actor->accountId);
        $tagOut = [
            'tagId' => (string) $row['id'],
            'itemName' => (string) $row['item_name'],
            'category' => (string) $row['category'],
            'description' => $row['description'] !== null ? (string) $row['description'] : '',
            'status' => (string) $row['status'],
            'isLost' => (string) $row['status'] === 'lost',
        ];
        $body = ['tag' => $tagOut, 'isOwner' => $isOwner];
        if ($isOwner) {
            $body['ownerId'] = (string) $row['owner_id'];
        }
        return Reply::json($response, 200, $body);
    }

    private static function mine(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, 'user');
        $owner = (string) $actor->accountId;
        return Reply::json($response, 200, [
            'tags' => self::tagsFor($pdo, $owner),
            'reports' => self::reportsForOwner($pdo, $owner),
        ]);
    }

    private static function registerTag(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, array $config, Limiter $limiter): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, 'user');
        self::enabled($pdo);
        self::budget($request, $pdo, $limiter, 'nfc_register', (string) $actor->accountId, 30, 3600, 'สร้างแท็กบ่อยเกินไป กรุณารอสักครู่');
        $body = self::body($request);
        Values::only($body, ['itemName', 'category', 'description', 'contacts', 'tagUid', 'readOnlyLocked']);
        $item = Values::text($body['itemName'] ?? null, 'itemName', 255, true);
        $category = Values::text($body['category'] ?? null, 'category', 64, true);
        $description = Values::text($body['description'] ?? null, 'description', 1000, false);
        $contacts = self::contacts($body['contacts'] ?? null, true);
        $uid = self::uid($body['tagUid'] ?? null);
        $locked = array_key_exists('readOnlyLocked', $body) ? Values::bool($body['readOnlyLocked'], 'readOnlyLocked') : true;
        if ($uid !== null) {
            $taken = Database::run($pdo, 'SELECT id FROM nfc_tags WHERE tag_uid = ? LIMIT 1', [$uid])->fetch();
            if (is_array($taken)) {
                throw new HttpError(409, 'tag_uid_taken');
            }
        }
        $id = self::freshId($pdo);
        $owner = (string) $actor->accountId;
        Feed::write($pdo, 'nfc_tags', static function (PDO $pdo) use ($id, $uid, $owner, $item, $category, $description, $contacts, $locked): void {
            Database::run(
                $pdo,
                'INSERT INTO nfc_tags (id, tag_uid, owner_id, item_name, category, description, contacts, status, read_only_locked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, \'active\', ?)',
                [$id, $uid, $owner, trim($item), $category, $description, $contacts, $locked ? 1 : 0]
            );
        });
        return Reply::json($response, 200, [
            'tagId' => $id,
            'tagUrl' => self::url($pdo, $config, $id),
        ]);
    }

    private static function found(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, Limiter $limiter, bool $contract): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, 'user');
        self::enabled($pdo);
        $body = self::body($request);
        if ($contract) {
            Values::only($body, ['tagId', 'finderMessage', 'locationFound', 'locationCoords', 'finderContacts']);
        } else {
            Values::only($body, [
                'tagId', 'ownerId', 'finderUserId', 'finderMessage', 'locationFound',
                'locationCoords', 'finderContacts', 'status',
            ]);
            if (isset($body['finderUserId']) && $body['finderUserId'] !== $actor->accountId) {
                throw new HttpError(403, 'forbidden');
            }
        }
        self::budget($request, $pdo, $limiter, 'nfc_found', (string) $actor->accountId, 20, 3600, 'คุณส่งรายงานพบของบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
        $tagId = self::tagId($body['tagId'] ?? null);
        $message = Values::text($body['finderMessage'] ?? null, 'finderMessage', 2000, true);
        $place = Values::text($body['locationFound'] ?? null, 'locationFound', 255, false);
        $coords = array_key_exists('locationCoords', $body) ? Values::coords($body['locationCoords'], 'locationCoords') : null;
        $contacts = array_key_exists('finderContacts', $body) && $body['finderContacts'] !== null
            ? self::contacts($body['finderContacts'], false)
            : null;
        $tag = self::tagRow($pdo, $tagId, false);
        if ($tag === null) {
            throw new HttpError(404, 'tag_not_found');
        }
        if ((string) $tag['status'] === 'disabled') {
            throw new HttpError(403, 'tag_disabled');
        }
        if (hash_equals((string) $tag['owner_id'], (string) $actor->accountId)) {
            throw new HttpError(403, 'cannot_report_own_tag');
        }
        $reportId = Ids::uuid();
        $owner = (string) $tag['owner_id'];
        $finder = (string) $actor->accountId;
        $itemName = (string) $tag['item_name'];
        Feed::write($pdo, 'nfc_found_reports', static function (PDO $pdo) use ($reportId, $tagId, $owner, $finder, $message, $place, $coords, $contacts): void {
            Database::run(
                $pdo,
                'INSERT INTO nfc_found_reports (
                    id, tag_id, owner_id, finder_user_id, finder_message, location_found, location_coords, finder_contacts, status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'pending\')',
                [$reportId, $tagId, $owner, $finder, trim($message), $place, $coords, $contacts]
            );
            Database::run(
                $pdo,
                'UPDATE nfc_tags SET last_found_report_id = ? WHERE id = ?',
                [$reportId, $tagId]
            );
            Feed::bump($pdo, 'nfc_tags');
        });
        self::logFound($pdo, $finder, $reportId, $tagId, $itemName, $owner);
        if ($contract) {
            return Reply::json($response, 200, ['reportId' => $reportId, 'success' => true]);
        }
        return Reply::json($response, 201, ['id' => $reportId]);
    }

    private static function listTags(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        $query = $request->getQueryParams();
        if (isset($query['ownerId']) && $query['ownerId'] !== '') {
            $owner = Values::uuid($query['ownerId'], 'ownerId', true);
            Gate::demand('nfc_tags', 'select', $actor, ['owner_id' => $owner]);
            return Reply::json($response, 200, ['items' => self::tagsFor($pdo, $owner)]);
        }
        Authz::requireRole($actor, 'admin');
        $limit = 200;
        if (isset($query['limit']) && $query['limit'] !== '') {
            if (!is_string($query['limit']) || preg_match('/^\d+$/', $query['limit']) !== 1) {
                throw new HttpError(400, 'invalid_input', ['field' => 'limit']);
            }
            $limit = (int) $query['limit'];
            if ($limit < 1 || $limit > 200) {
                throw new HttpError(400, 'invalid_input', ['field' => 'limit']);
            }
        }
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::tagColumns() . ' FROM nfc_tags ORDER BY registered_at DESC LIMIT ' . $limit
        )->fetchAll();
        return Reply::json($response, 200, ['items' => self::tagList($rows)]);
    }

    private static function oneTag(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $row = self::tagRow($pdo, self::tagId($id), true);
        Gate::demand('nfc_tags', 'select', Gate::actor($request), $row);
        return Reply::json($response, 200, ['tag' => self::tag($row)]);
    }

    private static function patchTag(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $row = self::tagRow($pdo, self::tagId($id), true);
        $actor = Gate::actor($request);
        Gate::demand('nfc_tags', 'update', $actor, $row);
        $body = self::body($request);
        Values::only($body, [
            'status', 'lostItemId', 'itemName', 'description', 'category', 'contacts',
            'ndefWritten', 'readOnlyLocked', 'tagUid', 'ndefWrittenAt',
        ]);
        if ($body === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        $sets = [];
        $params = [];
        if (array_key_exists('status', $body)) {
            $status = Values::text($body['status'], 'status', 16, true);
            if (!in_array($status, ['active', 'lost', 'returned', 'disabled'], true)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'status']);
            }
            $sets[] = 'status = ?';
            $params[] = $status;
        }
        if (array_key_exists('lostItemId', $body)) {
            $lost = Values::uuid($body['lostItemId'], 'lostItemId', false);
            if ($lost !== null) {
                self::ownLostItem($pdo, $lost, (string) $row['owner_id'], $actor->isAdmin());
            }
            $sets[] = 'lost_item_id = ?';
            $params[] = $lost;
        }
        if (array_key_exists('itemName', $body)) {
            $sets[] = 'item_name = ?';
            $params[] = trim(Values::text($body['itemName'], 'itemName', 255, true));
        }
        if (array_key_exists('description', $body)) {
            $sets[] = 'description = ?';
            $params[] = Values::text($body['description'], 'description', 1000, false);
        }
        if (array_key_exists('category', $body)) {
            $sets[] = 'category = ?';
            $params[] = Values::text($body['category'], 'category', 64, true);
        }
        if (array_key_exists('contacts', $body)) {
            $sets[] = 'contacts = ?';
            $params[] = self::contacts($body['contacts'], true);
        }
        if (array_key_exists('ndefWritten', $body)) {
            $written = Values::bool($body['ndefWritten'], 'ndefWritten');
            $sets[] = 'ndef_written_at = ' . ($written ? 'UTC_TIMESTAMP(3)' : 'NULL');
        } elseif (array_key_exists('ndefWrittenAt', $body)) {
            $sets[] = 'ndef_written_at = ?';
            $params[] = $body['ndefWrittenAt'] === null ? null : Time::sql($body['ndefWrittenAt'], 'ndefWrittenAt');
        }
        if (array_key_exists('readOnlyLocked', $body)) {
            $sets[] = 'read_only_locked = ?';
            $params[] = Values::bool($body['readOnlyLocked'], 'readOnlyLocked') ? 1 : 0;
        }
        if (array_key_exists('tagUid', $body)) {
            $uid = self::uid($body['tagUid']);
            if ($uid !== null) {
                $taken = Database::run($pdo, 'SELECT id FROM nfc_tags WHERE tag_uid = ? AND id <> ? LIMIT 1', [$uid, $row['id']])->fetch();
                if (is_array($taken)) {
                    throw new HttpError(409, 'tag_uid_taken');
                }
            }
            $sets[] = 'tag_uid = ?';
            $params[] = $uid;
        }
        $tagId = (string) $row['id'];
        $markReturned = ($body['status'] ?? null) === 'returned' && $row['lost_item_id'] !== null;
        $lostId = $row['lost_item_id'] !== null ? (string) $row['lost_item_id'] : null;
        $owner = (string) $row['owner_id'];
        $params[] = $tagId;
        Feed::write($pdo, 'nfc_tags', static function (PDO $pdo) use ($sets, $params, $markReturned, $lostId, $owner): void {
            Database::run($pdo, 'UPDATE nfc_tags SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            if ($markReturned && $lostId !== null) {
                Database::run(
                    $pdo,
                    'UPDATE lost_items SET status = \'claimed\' WHERE id = ? AND user_id = ?',
                    [$lostId, $owner]
                );
                Feed::bump($pdo, 'lost_items');
            }
        });
        return Reply::json($response, 200, ['success' => true]);
    }

    private static function listReports(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo): ResponseInterface
    {
        $actor = Gate::actor($request);
        Authz::requireRole($actor, 'user');
        $query = $request->getQueryParams();
        if (isset($query['ownerId']) && $query['ownerId'] !== '') {
            $owner = Values::uuid($query['ownerId'], 'ownerId', true);
            Gate::demand('nfc_found_reports', 'select', $actor, ['owner_id' => $owner, 'finder_user_id' => $owner]);
            return Reply::json($response, 200, ['items' => self::reportsForOwner($pdo, $owner)]);
        }
        if (isset($query['tagId']) && $query['tagId'] !== '') {
            $tagId = self::tagId($query['tagId']);
            $tag = self::tagRow($pdo, $tagId, false);
            $params = [$tagId];
            $sql = 'SELECT ' . self::reportColumns() . ' FROM nfc_found_reports WHERE tag_id = ?';
            if (!$actor->isAdmin()) {
                if ($tag !== null && hash_equals((string) $tag['owner_id'], (string) $actor->accountId)) {
                    $sql .= '';
                } else {
                    $sql .= ' AND finder_user_id = ?';
                    $params[] = $actor->accountId;
                }
            }
            $sql .= ' ORDER BY created_at DESC LIMIT 200';
            $rows = Database::run($pdo, $sql, $params)->fetchAll();
            return Reply::json($response, 200, ['items' => self::reportList($rows)]);
        }
        throw new HttpError(400, 'invalid_input', ['field' => 'tagId']);
    }

    private static function patchReport(ServerRequestInterface $request, ResponseInterface $response, PDO $pdo, string $id): ResponseInterface
    {
        $id = Values::uuid($id, 'id', true);
        $row = Database::run(
            $pdo,
            'SELECT id, owner_id, finder_user_id, status FROM nfc_found_reports WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            throw new HttpError(404, 'not_found');
        }
        Gate::demand('nfc_found_reports', 'update', Gate::actor($request), $row);
        $body = self::body($request);
        Values::only($body, ['status']);
        $status = Values::text($body['status'] ?? null, 'status', 16, true);
        if ($status !== 'viewed' && $status !== 'resolved') {
            throw new HttpError(400, 'invalid_input', ['field' => 'status']);
        }
        Feed::write($pdo, 'nfc_found_reports', static function (PDO $pdo) use ($id, $status): void {
            Database::run($pdo, 'UPDATE nfc_found_reports SET status = ? WHERE id = ?', [$status, $id]);
        });
        return Reply::json($response, 200, ['ok' => true]);
    }

    private static function enabled(PDO $pdo): void
    {
        $settings = Settings::read($pdo);
        if (($settings['nfcEnabled'] ?? true) === false) {
            throw new HttpError(403, 'nfc_disabled', ['message' => 'NFC ถูกปิดอยู่']);
        }
    }

    private static function budget(ServerRequestInterface $request, PDO $pdo, Limiter $limiter, string $scope, string $account, int $limit, int $window, string $message): void
    {
        $client = $request->getAttribute(Attrs::CLIENT);
        $ip = $client instanceof ClientAddress ? $client->ip : '0.0.0.0';
        $byIp = $limiter->hit($pdo, $scope . '_ip', $ip, $limit * 2, $window, time());
        $decision = $byIp->allowed
            ? $limiter->hit($pdo, $scope, $account, $limit, $window, time())
            : $byIp;
        if ($decision->allowed) {
            return;
        }
        throw new HttpError(
            429,
            'rate_limit_exceeded',
            ['message' => $message],
            ['Retry-After' => (string) max(1, $decision->retryAfter)]
        );
    }

    private static function logFound(PDO $pdo, string $finder, string $reportId, string $tagId, string $itemName, string $owner): void
    {
        $settings = Settings::read($pdo);
        if (($settings['notifyOnNewReport'] ?? true) === false) {
            return;
        }
        $account = Database::run(
            $pdo,
            'SELECT email, display_name FROM accounts WHERE id = ? LIMIT 1',
            [$finder]
        )->fetch();
        $email = is_array($account) ? (string) ($account['email'] ?? '') : '';
        $name = is_array($account) ? (string) ($account['display_name'] ?? '') : '';
        $id = Ids::uuid();
        try {
            Feed::write($pdo, 'activity_logs', static function (PDO $pdo) use ($id, $itemName, $tagId, $reportId, $finder, $email, $name, $owner): void {
                Database::run(
                    $pdo,
                    'INSERT INTO activity_logs (id, action, action_type, target_type, target_id, target_name, user_id, user_email, user_name, details)
                     VALUES (?, ?, \'create\', \'nfcReport\', ?, ?, ?, ?, ?, ?)',
                    [
                        $id,
                        'แจ้งพบของผ่าน NFC Tag: ' . mb_substr($itemName, 0, 180),
                        $reportId,
                        mb_substr($itemName, 0, 255),
                        $finder,
                        $email !== '' ? $email : null,
                        $name !== '' ? $name : null,
                        json_encode(['tagId' => $tagId, 'ownerId' => $owner], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    ]
                );
            });
        } catch (\Throwable $e) {
            if ($e instanceof HttpError) {
                return;
            }
        }
    }

    private static function ownLostItem(PDO $pdo, string $id, string $owner, bool $admin): void
    {
        $row = Database::run($pdo, 'SELECT user_id FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
        if (!is_array($row)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'lostItemId']);
        }
        if (!$admin && (string) ($row['user_id'] ?? '') !== $owner) {
            throw new HttpError(403, 'forbidden');
        }
    }

    private static function tagsFor(PDO $pdo, string $owner): array
    {
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::tagColumns() . ' FROM nfc_tags WHERE owner_id = ? ORDER BY registered_at DESC LIMIT 200',
            [$owner]
        )->fetchAll();
        return self::tagList($rows);
    }

    private static function reportsForOwner(PDO $pdo, string $owner): array
    {
        $rows = Database::run(
            $pdo,
            'SELECT ' . self::reportColumns() . ' FROM nfc_found_reports WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200',
            [$owner]
        )->fetchAll();
        return self::reportList($rows);
    }

    private static function tagRow(PDO $pdo, string $id, bool $required): ?array
    {
        $row = Database::run(
            $pdo,
            'SELECT ' . self::tagColumns() . ' FROM nfc_tags WHERE id = ? LIMIT 1',
            [$id]
        )->fetch();
        if (!is_array($row)) {
            if ($required) {
                throw new HttpError(404, 'not_found');
            }
            return null;
        }
        return $row;
    }

    private static function freshId(PDO $pdo): string
    {
        for ($i = 0; $i < 5; $i++) {
            $id = self::randomId();
            $row = Database::run($pdo, 'SELECT id FROM nfc_tags WHERE id = ? LIMIT 1', [$id])->fetch();
            if (!is_array($row)) {
                return $id;
            }
        }
        throw new HttpError(500, 'server_error');
    }

    private static function randomId(): string
    {
        $id = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < 12; $i++) {
            $id .= self::ALPHABET[random_int(0, $max)];
        }
        return $id;
    }

    private static function tagId(mixed $value): string
    {
        $text = Values::text($value, 'tagId', 32, true);
        $text = strtoupper(trim($text));
        if (preg_match('/^[A-Z0-9]{4,32}$/', $text) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tagId']);
        }
        return $text;
    }

    private static function uid(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $text = Values::text($value, 'tagUid', 64, true);
        if (preg_match('/^[A-Za-z0-9:_-]{1,64}$/', $text) !== 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'tagUid']);
        }
        return $text;
    }

    private static function contacts(mixed $value, bool $required): string
    {
        if (!is_array($value) || !array_is_list($value)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'contacts']);
        }
        if ($required && $value === []) {
            throw new HttpError(400, 'invalid_input', ['field' => 'contacts']);
        }
        return Values::contacts($value, 'contacts', $required);
    }

    private static function url(PDO $pdo, array $config, string $id): string
    {
        $settings = Settings::read($pdo);
        $base = $settings['nfcPublicBaseUrl'] ?? null;
        if (!is_string($base) || !str_starts_with($base, 'https://')) {
            $base = rtrim((string) ($config['APP_URL'] ?? ''), '/');
        } else {
            $base = rtrim($base, '/');
        }
        if ($base === '') {
            return '/nfc/t/' . $id;
        }
        return $base . '/nfc/t/' . $id;
    }

    private static function body(ServerRequestInterface $request): array
    {
        $body = $request->getAttribute(Attrs::JSON);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'body']);
        }
        return $body;
    }

    private static function tagColumns(): string
    {
        return 'id, tag_uid, owner_id, item_name, category, description, contacts, status, read_only_locked, lost_item_id, last_found_report_id, ndef_written_at, registered_at, updated_at';
    }

    private static function reportColumns(): string
    {
        return 'id, tag_id, owner_id, finder_user_id, finder_message, location_found, location_coords, finder_contacts, status, created_at';
    }

    private static function tagList(array $rows): array
    {
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::tag($row);
            }
        }
        return $items;
    }

    private static function reportList(array $rows): array
    {
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::report($row);
            }
        }
        return $items;
    }

    private static function tag(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'tagUid' => $row['tag_uid'] !== null ? (string) $row['tag_uid'] : null,
            'ownerId' => (string) $row['owner_id'],
            'itemName' => (string) $row['item_name'],
            'category' => (string) $row['category'],
            'description' => $row['description'] !== null ? (string) $row['description'] : null,
            'contacts' => Values::jsonList($row['contacts'] ?? []),
            'status' => (string) $row['status'],
            'readOnlyLocked' => Values::flag($row['read_only_locked'] ?? 0),
            'lostItemId' => $row['lost_item_id'] !== null ? (string) $row['lost_item_id'] : null,
            'lastFoundReportId' => $row['last_found_report_id'] !== null ? (string) $row['last_found_report_id'] : null,
            'ndefWrittenAt' => Time::iso($row['ndef_written_at']),
            'registeredAt' => Time::iso($row['registered_at']),
            'updatedAt' => Time::iso($row['updated_at']),
        ];
    }

    private static function report(array $row): array
    {
        $coords = Values::jsonObject($row['location_coords'] ?? null);
        $contacts = Values::jsonList($row['finder_contacts'] ?? null);
        return [
            'id' => (string) $row['id'],
            'tagId' => (string) $row['tag_id'],
            'ownerId' => (string) $row['owner_id'],
            'finderUserId' => (string) $row['finder_user_id'],
            'finderMessage' => (string) $row['finder_message'],
            'locationFound' => $row['location_found'] !== null ? (string) $row['location_found'] : null,
            'locationCoords' => $coords,
            'finderContacts' => $contacts === [] ? null : $contacts,
            'status' => (string) $row['status'],
            'createdAt' => Time::iso($row['created_at']),
        ];
    }
}
