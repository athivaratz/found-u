<?php

declare(strict_types=1);

namespace Foundu\Agent;

use Foundu\Ai\Credentials;
use Foundu\Ai\Generate;
use Foundu\Ai\Vision;
use Foundu\Auth\Actor;
use Foundu\Data\Feed;
use Foundu\Data\Items as ItemRows;
use Foundu\Data\Settings;
use Foundu\Data\Time;
use Foundu\Data\Values;
use Foundu\Database;
use Foundu\Http\HttpError;
use Foundu\Ids;
use Foundu\Match\Suggest;
use Foundu\Search\Items as SearchItems;
use PDO;

final class Tools
{
    private const CATEGORIES = ['wallet', 'phone', 'keys', 'bag', 'electronics', 'documents', 'clothing', 'accessories', 'other'];
    private const CONTACTS = ['phone', 'line', 'instagram', 'facebook', 'email'];
    private const STATUSES = ['searching', 'pending_room_confirm', 'found', 'claimed', 'expired'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly Actor $actor,
        private readonly array $settings,
        private readonly array $config,
        private readonly ?array $clientLocation,
        private readonly bool $adminBypass,
        private readonly Generate $generate,
        private readonly Credentials $credentials,
    ) {
    }

    public static function schema(): array
    {
        return [
            self::decl('searchItems', 'Search the public lost-item catalog. Returns public-safe fields. Location must match the user query. Never guess from general knowledge.', [
                'query' => ['type' => 'string', 'description' => 'Item name and location'],
                'type' => ['type' => 'string', 'enum' => ['lost', 'found', 'all']],
                'category' => ['type' => 'string'],
                'status' => ['type' => 'string', 'enum' => self::STATUSES],
                'limit' => ['type' => 'integer'],
            ], ['query']),
            self::decl('lookupTrackingCode', 'Look up an item by the exact tracking code the user provided. Never invent codes.', [
                'trackingCode' => ['type' => 'string', 'description' => 'LOST-XXXXXX or FOUND-XXXXXX'],
            ], ['trackingCode']),
            self::decl('analyzeImage', 'Analyze an item photo already attached as base64. Do not pass a remote URL.', [
                'imageBase64' => ['type' => 'string'],
                'imageUrl' => ['type' => 'string'],
            ], []),
            self::decl('findMatches', 'Find likely matches for a lost or found item the caller owns.', [
                'type' => ['type' => 'string', 'enum' => ['lost', 'found']],
                'itemId' => ['type' => 'string'],
                'useAI' => ['type' => 'boolean'],
            ], ['type', 'itemId']),
            self::decl('getUserItems', 'List lost and found items reported by the current user.', [
                'limit' => ['type' => 'integer'],
            ], []),
            self::decl('reportLostItem', 'Report a lost item for the signed-in user. Extract fields from the user message.', [
                'itemName' => ['type' => 'string'],
                'category' => ['type' => 'string'],
                'description' => ['type' => 'string'],
                'locationLost' => ['type' => 'string'],
                'dateLost' => ['type' => 'string'],
                'time' => ['type' => 'string'],
                'contact' => ['type' => 'string'],
                'contactType' => ['type' => 'string'],
            ], ['itemName', 'category', 'locationLost']),
            self::decl('reportFoundItem', 'Report a found item for the signed-in user. GPS comes from the device, not from these fields.', [
                'description' => ['type' => 'string'],
                'locationFound' => ['type' => 'string'],
                'itemName' => ['type' => 'string'],
                'category' => ['type' => 'string'],
                'dateFound' => ['type' => 'string'],
                'time' => ['type' => 'string'],
                'dropOffLocation' => ['type' => 'string'],
                'contact' => ['type' => 'string'],
                'contactType' => ['type' => 'string'],
            ], ['description', 'locationFound']),
        ];
    }

    public function call(string $name, array $args, int $remainingMs): array
    {
        try {
            $envelope = match ($name) {
                'searchItems' => $this->search($args),
                'lookupTrackingCode' => $this->lookup($args),
                'analyzeImage' => $this->image($args),
                'findMatches' => $this->matches($args, $remainingMs),
                'getUserItems' => $this->mine($args),
                'reportLostItem' => $this->reportLost($args),
                'reportFoundItem' => $this->reportFound($args),
                default => $this->fail('items', 'ไม่รู้จักเครื่องมือ'),
            };
        } catch (\Throwable) {
            $envelope = $this->fail('items', 'เครื่องมือทำงานไม่สำเร็จ');
        }
        $capped = Guard::cap($envelope);
        if ($capped !== $envelope) {
            Guard::trip($this->pdo, $this->actor, 'tool_output_capped');
        }
        return $capped;
    }

    public function codes(array $envelope): array
    {
        if (($envelope['ok'] ?? false) !== true) {
            return [];
        }
        $found = [];
        $this->walk($envelope['data'] ?? null, $found);
        return $found;
    }

    private function search(array $args): array
    {
        $query = Prompt::plain((string) ($args['query'] ?? ''), 80);
        if ($query === '') {
            return $this->fail('items', 'ต้องระบุคำค้น');
        }
        $type = (string) ($args['type'] ?? 'lost');
        if (!in_array($type, ['lost', 'found', 'all'], true)) {
            $type = 'lost';
        }
        if (!$this->actor->isAdmin() && $type === 'found') {
            $type = 'lost';
            Guard::trip($this->pdo, $this->actor, 'search_found_hidden');
        }
        $status = (string) ($args['status'] ?? 'searching');
        if (!in_array($status, self::STATUSES, true)) {
            $status = 'searching';
        }
        $limit = self::limit($args['limit'] ?? 10, 10);
        try {
            $result = SearchItems::search($this->pdo, $this->config, [
                'q' => $query,
                'type' => $type,
                'mode' => 'agent',
                'limit' => $limit,
                'category' => Prompt::plain((string) ($args['category'] ?? ''), 64),
                'status' => $status,
            ]);
        } catch (HttpError) {
            return $this->fail('items', 'ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง', ['lost' => [], 'found' => [], 'total' => 0, 'exactMatch' => false, 'filteredCount' => 0]);
        }
        $lost = [];
        foreach ($result['lost'] ?? [] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $lost[] = Privacy::lost($item, Privacy::owns($item, $this->actor->accountId, $this->actor->isAdmin()));
        }
        $found = [];
        $hidden = 0;
        foreach ($result['found'] ?? [] as $item) {
            if (!is_array($item)) {
                continue;
            }
            if (!$this->actor->isAdmin() && !Privacy::owns($item, $this->actor->accountId, false)) {
                $hidden++;
                continue;
            }
            $found[] = Privacy::found($item, true);
        }
        if ($hidden > 0) {
            Guard::trip($this->pdo, $this->actor, 'search_redact_found');
        }
        $filtered = (int) ($result['filteredCount'] ?? 0);
        if ($filtered > 0) {
            Guard::trip($this->pdo, $this->actor, 'search_location_filter');
        }
        $total = count($lost) + count($found);
        return [
            'ok' => true,
            'resultType' => 'items',
            'data' => [
                'lost' => $lost,
                'found' => $found,
                'total' => $total,
                'exactMatch' => $total > 0 && $filtered === 0,
                'filteredCount' => $filtered,
            ],
        ];
    }

    private function lookup(array $args): array
    {
        $code = strtoupper(Prompt::plain((string) ($args['trackingCode'] ?? ''), 32));
        if (preg_match('/^(LOST|FOUND)-[A-Z0-9]{4,12}$/', $code) !== 1) {
            return $this->fail('tracking', 'ไม่พบรหัสติดตามนี้');
        }
        $kind = str_starts_with($code, 'FOUND-') ? 'found' : 'lost';
        $row = $this->byCode($kind, $code);
        if ($row === null) {
            return $this->fail('tracking', 'ไม่พบรหัสติดตามนี้');
        }
        $owner = Privacy::owns($row, $this->actor->accountId, $this->actor->isAdmin());
        if ($kind === 'found' && !$owner) {
            Guard::trip($this->pdo, $this->actor, 'lookup_found_hidden');
            return $this->fail('tracking', 'ไม่พบรหัสติดตามนี้');
        }
        $data = $kind === 'found' ? Privacy::found($row, true) : Privacy::lostLookup($row, $owner);
        return ['ok' => true, 'resultType' => 'tracking', 'data' => $data];
    }

    private function image(array $args): array
    {
        $url = (string) ($args['imageUrl'] ?? '');
        if ($url !== '' && !str_starts_with($url, 'data:')) {
            Guard::trip($this->pdo, $this->actor, 'remote_image_blocked');
            return $this->fail('vision', 'โหลดรูปจากลิงก์ภายนอกไม่ได้');
        }
        $mime = 'image/jpeg';
        $base64 = is_string($args['imageBase64'] ?? null) ? $args['imageBase64'] : '';
        if (str_starts_with($url, 'data:') && preg_match('#^data:(image/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$#', $url, $match) === 1) {
            $mime = $match[1];
            $base64 = $match[2];
        }
        $base64 = preg_replace('/\s+/', '', $base64) ?? '';
        if ($base64 === '' || strlen($base64) > 1_600_000) {
            return $this->fail('vision', 'ต้องระบุรูปในแชท');
        }
        $extracted = Vision::extract($this->generate, $this->credentials, $mime, $base64, $this->settings);
        $data = is_array($extracted) ? ($extracted['data'] ?? null) : null;
        return [
            'ok' => is_array($data),
            'resultType' => 'vision',
            'data' => is_array($data) ? $data : null,
            'message' => is_array($data) ? null : 'วิเคราะห์รูปไม่สำเร็จ',
        ];
    }

    private function matches(array $args, int $remainingMs): array
    {
        $type = (string) ($args['type'] ?? '');
        if ($type !== 'lost' && $type !== 'found') {
            return $this->fail('match', 'ไม่พบรายการ');
        }
        $id = (string) ($args['itemId'] ?? '');
        if (preg_match('/^[0-9a-fA-F-]{36}$/', $id) !== 1) {
            return $this->fail('match', $type === 'lost' ? 'ไม่พบรายการของหาย' : 'ไม่พบรายการของเจอ');
        }
        $item = $type === 'lost'
            ? $this->byId('lost', $id)
            : $this->byId('found', $id);
        if ($item === null) {
            return $this->fail('match', $type === 'lost' ? 'ไม่พบรายการของหาย' : 'ไม่พบรายการของเจอ');
        }
        if (!Privacy::owns($item, $this->actor->accountId, $this->actor->isAdmin())) {
            Guard::trip($this->pdo, $this->actor, 'find_matches_forbidden');
            return $this->fail('match', 'ไม่มีสิทธิ์จับคู่รายการนี้');
        }
        $useAi = ($args['useAI'] ?? false) === true && $remainingMs > 12000;
        try {
            $matches = Suggest::one(
                $this->pdo,
                $type,
                $id,
                $useAi,
                $useAi ? $this->generate : null,
                $useAi ? $this->credentials : null,
                $this->settings
            );
        } catch (HttpError) {
            return $this->fail('match', 'จับคู่ไม่สำเร็จ ลองใหม่อีกครั้ง');
        }
        $out = [];
        foreach ($matches as $match) {
            if (!is_array($match)) {
                continue;
            }
            $lost = is_array($match['lostItem'] ?? null) ? $match['lostItem'] : [];
            $found = is_array($match['foundItem'] ?? null) ? $match['foundItem'] : [];
            $out[] = [
                'score' => $match['score'] ?? 0,
                'confidence' => $match['confidence'] ?? 'low',
                'scorePercentage' => $match['scorePercentage'] ?? 0,
                'reasons' => array_slice(array_values(array_filter($match['reasons'] ?? [], 'is_string')), 0, 6),
                'lostItem' => Privacy::lost($lost, Privacy::owns($lost, $this->actor->accountId, $this->actor->isAdmin())),
                'foundItem' => Privacy::found($found, Privacy::owns($found, $this->actor->accountId, $this->actor->isAdmin())),
            ];
        }
        return ['ok' => true, 'resultType' => 'match', 'data' => $out];
    }

    private function mine(array $args): array
    {
        if ($this->actor->accountId === null) {
            return $this->fail('items', 'ต้องเข้าสู่ระบบก่อน', ['lost' => [], 'found' => [], 'total' => 0]);
        }
        $limit = self::limit($args['limit'] ?? 5, 10);
        $lostRows = Database::run(
            $this->pdo,
            'SELECT ' . $this->lostColumns() . ' FROM lost_items WHERE user_id = ? ORDER BY created_at DESC LIMIT ' . $limit,
            [$this->actor->accountId]
        )->fetchAll();
        $foundRows = Database::run(
            $this->pdo,
            'SELECT ' . $this->foundColumns() . ' FROM found_items WHERE user_id = ? ORDER BY created_at DESC LIMIT ' . $limit,
            [$this->actor->accountId]
        )->fetchAll();
        $lost = [];
        foreach ($lostRows as $row) {
            $lost[] = Privacy::lost(ItemRows::lost($row), true);
        }
        $found = [];
        foreach ($foundRows as $row) {
            $found[] = Privacy::found(ItemRows::found($row), true);
        }
        return [
            'ok' => true,
            'resultType' => 'items',
            'data' => ['lost' => $lost, 'found' => $found, 'total' => count($lost) + count($found)],
        ];
    }

    private function reportLost(array $args): array
    {
        if ($this->actor->accountId === null) {
            return $this->fail('report', 'ต้องเข้าสู่ระบบก่อนแจ้งของหาย');
        }
        $name = Prompt::plain((string) ($args['itemName'] ?? ''), 200);
        $location = Prompt::plain((string) ($args['locationLost'] ?? ''), 255);
        if ($name === '' || $location === '') {
            return $this->fail('report', 'ต้องมีชื่อของและสถานที่ที่หาย');
        }
        $category = self::category((string) ($args['category'] ?? ''));
        $description = Prompt::plain((string) ($args['description'] ?? ''), 2000);
        if ($description === '') {
            $description = $name;
        }
        $contacts = $this->contacts($args);
        $id = Ids::uuid();
        $code = $this->code('lost_items', 'LOST');
        $date = self::when(
            is_string($args['dateLost'] ?? null) ? $args['dateLost'] : null,
            is_string($args['time'] ?? null) ? $args['time'] : null
        );
        try {
            $contactJson = Values::contacts($contacts, 'contacts', false);
        } catch (HttpError) {
            return $this->fail('report', 'ช่องทางติดต่อไม่ถูกต้อง');
        }
        Feed::write($this->pdo, 'lost_items', function (PDO $pdo) use ($id, $code, $name, $category, $description, $location, $date, $contactJson): void {
            Database::run(
                $pdo,
                'INSERT INTO lost_items (
                    id, tracking_code, item_name, category, description, location_lost, location_place_name,
                    date_lost, contacts, user_id, student_id, status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)), ?, ?, ?, \'searching\')',
                [$id, $code, $name, $category, $description, $location, $location, $date, $contactJson, $this->actor->accountId, $this->actor->studentId]
            );
        });
        $item = $this->byId('lost', $id);
        return [
            'ok' => true,
            'resultType' => 'report',
            'data' => [
                'type' => 'lost',
                'item' => $item === null ? ['trackingCode' => $code] : Privacy::lost($item, true),
                'matches' => $this->quietMatches('lost', $id),
            ],
        ];
    }

    private function reportFound(array $args): array
    {
        if ($this->actor->accountId === null) {
            return $this->fail('report', 'ต้องเข้าสู่ระบบก่อนแจ้งเจอของ');
        }
        $description = Prompt::plain((string) ($args['description'] ?? ''), 2000);
        $location = Prompt::plain((string) ($args['locationFound'] ?? ''), 255);
        if ($description === '' || $location === '') {
            return $this->fail('report', 'ต้องมีรายละเอียดและสถานที่ที่เจอ');
        }
        $gate = Fence::allow($this->clientLocation, $this->settings, $this->adminBypass && $this->actor->isAdmin());
        if ($gate['ok'] !== true) {
            Guard::trip($this->pdo, $this->actor, 'found_location_' . (string) ($gate['code'] ?? 'blocked'));
            return [
                'ok' => false,
                'resultType' => 'report',
                'data' => ['locationBlocked' => true, 'locationCode' => $gate['code'] ?? null],
                'message' => (string) ($gate['message'] ?? 'ยังแจ้งเจอของไม่ได้'),
            ];
        }
        $name = Prompt::plain((string) ($args['itemName'] ?? ''), 200);
        $category = isset($args['category']) && $args['category'] !== '' ? self::category((string) $args['category']) : null;
        $drop = Prompt::plain((string) ($args['dropOffLocation'] ?? ''), 64);
        if ($drop === '') {
            $drop = 'personnel_office';
        }
        $contacts = $this->contacts($args, 'contact', 'contactType');
        try {
            $contactJson = $contacts === [] ? null : Values::contacts($contacts, 'finderContacts', false);
        } catch (HttpError) {
            return $this->fail('report', 'ช่องทางติดต่อไม่ถูกต้อง');
        }
        $id = Ids::uuid();
        $code = $this->code('found_items', 'FOUND');
        $date = self::when(
            is_string($args['dateFound'] ?? null) ? $args['dateFound'] : null,
            is_string($args['time'] ?? null) ? $args['time'] : null
        );
        $minutes = Settings::handoverMinutes($this->pdo);
        $coords = null;
        if (is_array($this->clientLocation)) {
            try {
                $coords = Values::coords([
                    'lat' => $this->clientLocation['lat'],
                    'lng' => $this->clientLocation['lng'],
                    'source' => 'gps',
                ], 'locationCoords');
            } catch (HttpError) {
                $coords = null;
            }
        }
        Feed::write($this->pdo, 'found_items', function (PDO $pdo) use ($id, $code, $name, $category, $description, $location, $date, $drop, $contactJson, $coords, $minutes): void {
            $deadline = $minutes === null ? 'NULL' : 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ' . $minutes . ' MINUTE)';
            Database::run(
                $pdo,
                'INSERT INTO found_items (
                    id, tracking_code, item_name, category, description, location_found, location_place_name,
                    location_coords, date_found, drop_off_location, finder_contacts, user_id, status, handover_deadline_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)), ?, ?, ?, \'pending_room_confirm\', ' . $deadline . ')',
                [$id, $code, $name !== '' ? $name : null, $category, $description, $location, $location, $coords, $date, $drop, $contactJson, $this->actor->accountId]
            );
        });
        $item = $this->byId('found', $id);
        return [
            'ok' => true,
            'resultType' => 'report',
            'data' => [
                'type' => 'found',
                'item' => $item === null ? ['trackingCode' => $code] : Privacy::found($item, true),
                'matches' => $this->quietMatches('found', $id),
            ],
        ];
    }

    private function quietMatches(string $type, string $id): array
    {
        try {
            $matches = Suggest::one($this->pdo, $type, $id, false, null, null, $this->settings);
        } catch (\Throwable) {
            return [];
        }
        $out = [];
        foreach (array_slice($matches, 0, 3) as $match) {
            if (!is_array($match)) {
                continue;
            }
            $lost = is_array($match['lostItem'] ?? null) ? $match['lostItem'] : [];
            $found = is_array($match['foundItem'] ?? null) ? $match['foundItem'] : [];
            $out[] = [
                'scorePercentage' => $match['scorePercentage'] ?? 0,
                'confidence' => $match['confidence'] ?? 'low',
                'reasons' => array_slice(array_values(array_filter($match['reasons'] ?? [], 'is_string')), 0, 4),
                'lostItem' => Privacy::lost($lost, Privacy::owns($lost, $this->actor->accountId, $this->actor->isAdmin())),
                'foundItem' => Privacy::found($found, Privacy::owns($found, $this->actor->accountId, $this->actor->isAdmin())),
            ];
        }
        return $out;
    }

    private function contacts(array $args, string $valueKey = 'contact', string $typeKey = 'contactType'): array
    {
        $value = Prompt::plain((string) ($args[$valueKey] ?? ''), 120);
        if ($value === '') {
            return [];
        }
        $type = (string) ($args[$typeKey] ?? 'phone');
        if (!in_array($type, self::CONTACTS, true)) {
            $type = 'phone';
        }
        return [['type' => $type, 'value' => $value]];
    }

    private function byCode(string $kind, string $code): ?array
    {
        if ($kind === 'found') {
            $row = Database::run($this->pdo, 'SELECT ' . $this->foundColumns() . ' FROM found_items WHERE tracking_code = ? ORDER BY created_at DESC LIMIT 1', [$code])->fetch();
            return is_array($row) ? ItemRows::found($row) : null;
        }
        $row = Database::run($this->pdo, 'SELECT ' . $this->lostColumns() . ' FROM lost_items WHERE tracking_code = ? ORDER BY created_at DESC LIMIT 1', [$code])->fetch();
        return is_array($row) ? ItemRows::lost($row) : null;
    }

    private function byId(string $kind, string $id): ?array
    {
        if ($kind === 'found') {
            $row = Database::run($this->pdo, 'SELECT ' . $this->foundColumns() . ' FROM found_items WHERE id = ? LIMIT 1', [$id])->fetch();
            return is_array($row) ? ItemRows::found($row) : null;
        }
        $row = Database::run($this->pdo, 'SELECT ' . $this->lostColumns() . ' FROM lost_items WHERE id = ? LIMIT 1', [$id])->fetch();
        return is_array($row) ? ItemRows::lost($row) : null;
    }

    private function code(string $table, string $prefix): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $sql = $table === 'found_items'
            ? 'SELECT id FROM found_items WHERE tracking_code = ? LIMIT 1'
            : 'SELECT id FROM lost_items WHERE tracking_code = ? LIMIT 1';
        for ($try = 0; $try < 5; $try++) {
            $code = $prefix . '-';
            for ($i = 0; $i < 6; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $exists = Database::run($this->pdo, $sql, [$code])->fetch();
            if (!is_array($exists)) {
                return $code;
            }
        }
        return $prefix . '-' . strtoupper(bin2hex(random_bytes(3)));
    }

    private function lostColumns(): string
    {
        return 'id, tracking_code, item_name, category, description, location_lost, location_place_name, location_coords, date_lost, contacts, user_id, student_id, status, matched_found_id, created_at, updated_at';
    }

    private function foundColumns(): string
    {
        return 'id, tracking_code, photo_url, item_name, category, color, brand, description, location_found, location_place_name, location_coords, date_found, drop_off_location, finder_contacts, user_id, status, room_handover_confirmed, room_handover_confirmed_at, room_handover_confirmed_by, room_handover_confirmed_by_name, handover_deadline_at, expired_at, matched_lost_id, created_at, updated_at';
    }

    private function walk(mixed $value, array &$found): void
    {
        if (!is_array($value)) {
            return;
        }
        if (is_string($value['trackingCode'] ?? null) && $value['trackingCode'] !== '') {
            $found[] = strtoupper($value['trackingCode']);
        }
        foreach ($value as $child) {
            if (is_array($child)) {
                $this->walk($child, $found);
            }
        }
    }

    private function fail(string $type, string $message, mixed $data = null): array
    {
        return [
            'ok' => false,
            'resultType' => $type,
            'data' => $data,
            'message' => $message,
        ];
    }

    private static function decl(string $name, string $description, array $properties, array $required): array
    {
        $schema = ['type' => 'object', 'properties' => $properties];
        if ($required !== []) {
            $schema['required'] = $required;
        }
        return ['name' => $name, 'description' => $description, 'parameters' => $schema];
    }

    private static function limit(mixed $value, int $default): int
    {
        if (!is_int($value) && !(is_float($value) && floor($value) === $value)) {
            return $default;
        }
        $value = (int) $value;
        if ($value < 1) {
            return 1;
        }
        return min($value, 10);
    }

    private static function category(string $value): string
    {
        $value = strtolower(trim($value));
        return in_array($value, self::CATEGORIES, true) ? $value : 'other';
    }

    private static function when(?string $date, ?string $time): ?string
    {
        foreach ([$date, $time] as $candidate) {
            if (!is_string($candidate)) {
                continue;
            }
            $candidate = trim($candidate);
            if ($candidate === '') {
                continue;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}/', $candidate) === 1) {
                $normalized = str_replace('T', ' ', rtrim($candidate, 'Z'));
                if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $normalized) === 1) {
                    $normalized .= ':00';
                }
                try {
                    return Time::sql($normalized, 'date');
                } catch (HttpError) {
                    continue;
                }
            }
            if (preg_match('/^(\d{1,2})[.:](\d{2})$/', $candidate, $match) === 1) {
                $hour = (int) $match[1];
                $minute = (int) $match[2];
                if ($hour > 23 || $minute > 59) {
                    continue;
                }
                return gmdate('Y-m-d') . sprintf(' %02d:%02d:00.000', $hour, $minute);
            }
        }
        return null;
    }
}
