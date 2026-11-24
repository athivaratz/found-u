<?php

declare(strict_types=1);

namespace Foundu\Auth;

use Cose\Algorithm\Manager;
use Cose\Algorithm\Signature\ECDSA\ES256;
use Cose\Algorithm\Signature\RSA\RS256;
use Foundu\Database;
use Foundu\Ids;
use PDO;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Uid\Uuid;
use Throwable;
use Webauthn\AttestationStatement\AndroidKeyAttestationStatementSupport;
use Webauthn\AttestationStatement\AppleAttestationStatementSupport;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\FidoU2FAttestationStatementSupport;
use Webauthn\AttestationStatement\PackedAttestationStatementSupport;
use Webauthn\AttestationStatement\TPMAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

// Options JSON matches what @simplewebauthn/browser sends to
// navigator.credentials. The challenge row is a sessions row with a 5 minute
// expiry. RP ID and origin come from APP_URL, not from the request.
final class Passkeys
{
    private const TTL = 300;

    private static ?SerializerInterface $serializer = null;

    public static function origin(array $config): ?array
    {
        $url = trim((string) ($config['APP_URL'] ?? ''));
        $parts = parse_url($url);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return null;
        }
        $scheme = strtolower((string) $parts['scheme']);
        if ($scheme !== 'https' && $scheme !== 'http') {
            return null;
        }
        $host = strtolower((string) $parts['host']);
        if ($host === '' || str_contains($host, '/') || str_contains($host, ' ')) {
            return null;
        }
        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        $origin = $scheme . '://' . $host;
        if ($port !== null && !(($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
            $origin .= ':' . $port;
        }
        return ['rpId' => $host, 'origin' => $origin];
    }

    public static function registrationOptions(array $account, string $rpId): array
    {
        $challenge = random_bytes(32);
        $studentId = (string) $account['student_id'];
        $display = trim(((string) ($account['first_name'] ?? '')) . ' ' . ((string) ($account['last_name'] ?? '')));
        if ($display === '') {
            $display = $studentId;
        }
        $exclude = [];
        foreach (self::credentials($account) as $credential) {
            $item = [
                'type' => 'public-key',
                'id' => $credential['credentialId'],
            ];
            if ($credential['transports'] !== []) {
                $item['transports'] = $credential['transports'];
            }
            $exclude[] = $item;
        }
        $options = [
            'rp' => ['name' => 'Found-U', 'id' => $rpId],
            'user' => [
                'id' => self::b64($studentId),
                'name' => $studentId,
                'displayName' => $display,
            ],
            'challenge' => self::b64($challenge),
            'pubKeyCredParams' => [
                ['type' => 'public-key', 'alg' => -7],
                ['type' => 'public-key', 'alg' => -257],
            ],
            'timeout' => 300000,
            'authenticatorSelection' => [
                'residentKey' => 'required',
                'requireResidentKey' => true,
                'userVerification' => 'preferred',
            ],
            'attestation' => 'none',
        ];
        if ($exclude !== []) {
            $options['excludeCredentials'] = $exclude;
        }
        return ['options' => $options, 'challenge' => self::b64($challenge), 'studentId' => $studentId];
    }

    public static function loginOptions(?array $account, string $rpId): array
    {
        $challenge = random_bytes(32);
        $options = [
            'challenge' => self::b64($challenge),
            'timeout' => 300000,
            'rpId' => $rpId,
            'userVerification' => 'preferred',
        ];
        $studentId = null;
        if (is_array($account)) {
            $studentId = (string) $account['student_id'];
            $allow = [];
            foreach (self::credentials($account) as $credential) {
                $item = [
                    'type' => 'public-key',
                    'id' => $credential['credentialId'],
                ];
                if ($credential['transports'] !== []) {
                    $item['transports'] = $credential['transports'];
                }
                $allow[] = $item;
            }
            if ($allow !== []) {
                $options['allowCredentials'] = $allow;
            }
        }
        return ['options' => $options, 'challenge' => self::b64($challenge), 'studentId' => $studentId];
    }

    public static function store(PDO $pdo, string $kind, ?string $accountId, array $payload, int $now, ?string $ip, ?string $userAgent): string
    {
        $token = Ids::token();
        Database::run(
            $pdo,
            'INSERT INTO sessions (
                id, token_hash, account_id, kind, csrf_token, ip, user_agent, challenge_json, created_at, expires_at
             ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)',
            [
                Ids::uuid(),
                Ids::sha256($token),
                $accountId,
                $kind,
                $ip !== null ? substr($ip, 0, 45) : null,
                $userAgent !== null ? substr($userAgent, 0, 255) : null,
                json_encode($payload, JSON_THROW_ON_ERROR),
                Ids::utc($now),
                Ids::utc($now + self::TTL),
            ]
        );
        return $token;
    }

    public static function take(PDO $pdo, string $kind, string $token, int $now): ?array
    {
        if ($token === '' || strlen($token) > 128 || !in_array($kind, ['passkey_login', 'passkey_register'], true)) {
            return null;
        }
        $pdo->beginTransaction();
        try {
            $row = Database::run(
                $pdo,
                'SELECT id, account_id, challenge_json, expires_at, revoked_at
                 FROM sessions WHERE token_hash = ? AND kind = ? LIMIT 1 FOR UPDATE',
                [Ids::sha256($token), $kind]
            )->fetch();
            if (!is_array($row) || $row['revoked_at'] !== null || Ids::unix((string) $row['expires_at']) <= $now) {
                $pdo->commit();
                return null;
            }
            $updated = Database::run(
                $pdo,
                'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
                [Ids::utc($now), $row['id']]
            );
            $pdo->commit();
            if ($updated->rowCount() < 1) {
                return null;
            }
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $json = $row['challenge_json'] ?? null;
        if (is_string($json)) {
            $json = json_decode($json, true);
        }
        return is_array($json) ? $json : null;
    }

    public static function verifyRegistration(array $stored, array $response, string $rpId, string $origin): CredentialRecord
    {
        $credential = self::load($response);
        if (!$credential->response instanceof AuthenticatorAttestationResponse) {
            throw new \RuntimeException('not an attestation');
        }
        $challenge = self::raw($stored['challenge'] ?? null);
        $studentId = (string) ($stored['studentId'] ?? '');
        $options = PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create('Found-U', $rpId),
            PublicKeyCredentialUserEntity::create($studentId, $studentId, $studentId),
            $challenge,
            [
                PublicKeyCredentialParameters::createPk(-7),
                PublicKeyCredentialParameters::createPk(-257),
            ],
            null,
            PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE
        );
        return AuthenticatorAttestationResponseValidator::create(self::factory($origin)->creationCeremony())
            ->check($credential->response, $options, $rpId);
    }

    public static function verifyLogin(array $stored, array $credentialRow, array $response, string $rpId, string $origin, ?string $userHandle): CredentialRecord
    {
        $credential = self::load($response);
        if (!$credential->response instanceof AuthenticatorAssertionResponse) {
            throw new \RuntimeException('not an assertion');
        }
        $record = self::record($credentialRow);
        $allow = [];
        if (is_string($stored['studentId'] ?? null) && $stored['studentId'] !== '') {
            $allow[] = PublicKeyCredentialDescriptor::create(
                PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
                self::raw($credentialRow['credentialId']),
                $credentialRow['transports']
            );
        }
        $options = PublicKeyCredentialRequestOptions::create(
            self::raw($stored['challenge'] ?? null),
            $rpId,
            $allow,
            PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
            300000
        );
        return AuthenticatorAssertionResponseValidator::create(self::factory($origin)->requestCeremony())
            ->check($record, $credential->response, $options, $rpId, $userHandle);
    }

    public static function credentials(array $account): array
    {
        $list = [];
        foreach ($account['passkey_credentials'] ?? [] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = $item['credentialId'] ?? null;
            $key = $item['publicKey'] ?? null;
            if (!is_string($id) || $id === '' || !is_string($key) || $key === '') {
                continue;
            }
            $transports = [];
            foreach ($item['transports'] ?? [] as $transport) {
                if (is_string($transport) && $transport !== '') {
                    $transports[] = $transport;
                }
            }
            $list[] = [
                'credentialId' => $id,
                'publicKey' => $key,
                'counter' => (int) ($item['counter'] ?? 0),
                'transports' => $transports,
                'aaguid' => is_string($item['aaguid'] ?? null) ? $item['aaguid'] : '00000000-0000-0000-0000-000000000000',
                'userHandle' => is_string($item['userHandle'] ?? null) ? $item['userHandle'] : (string) $account['student_id'],
                'backupEligible' => array_key_exists('backupEligible', $item) ? $item['backupEligible'] : null,
                'backupStatus' => array_key_exists('backupStatus', $item) ? $item['backupStatus'] : null,
                'uvInitialized' => array_key_exists('uvInitialized', $item) ? $item['uvInitialized'] : null,
                'deviceType' => is_string($item['deviceType'] ?? null) ? $item['deviceType'] : null,
                'backedUp' => array_key_exists('backedUp', $item) ? (bool) $item['backedUp'] : null,
                'createdAt' => is_string($item['createdAt'] ?? null) ? $item['createdAt'] : null,
            ];
        }
        return $list;
    }

    public static function findCredential(array $account, string $id): ?array
    {
        foreach (self::credentials($account) as $credential) {
            if (strlen($credential['credentialId']) === strlen($id) && hash_equals($credential['credentialId'], $id)) {
                return $credential;
            }
        }
        return null;
    }

    public static function storedFromRecord(CredentialRecord $record, array $previous, array $transports): array
    {
        return [
            'credentialId' => self::b64($record->publicKeyCredentialId),
            'publicKey' => self::b64($record->credentialPublicKey),
            'counter' => $record->counter,
            'transports' => $transports !== [] ? $transports : ($previous['transports'] ?? []),
            'aaguid' => $record->aaguid->toRfc4122(),
            'userHandle' => $record->userHandle,
            'backupEligible' => $record->backupEligible,
            'backupStatus' => $record->backupStatus,
            'uvInitialized' => $record->uvInitialized,
            'deviceType' => ($record->backupEligible ?? false) ? 'multiDevice' : 'singleDevice',
            'backedUp' => (bool) ($record->backupStatus ?? false),
            'createdAt' => $previous['createdAt'] ?? gmdate('Y-m-d\TH:i:s') . '.000Z',
        ];
    }

    public static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function raw(mixed $value): string
    {
        if (!is_string($value) || $value === '' || strlen($value) > 512) {
            throw new \RuntimeException('bad challenge');
        }
        $pad = strlen($value) % 4;
        $padded = $value . ($pad > 0 ? str_repeat('=', 4 - $pad) : '');
        $raw = base64_decode(strtr($padded, '-_', '+/'), true);
        if (!is_string($raw) || $raw === '') {
            throw new \RuntimeException('bad challenge');
        }
        return $raw;
    }

    public static function studentFromHandle(?string $handle): ?string
    {
        if ($handle === null || $handle === '') {
            return null;
        }
        $raw = self::tryRaw($handle);
        if ($raw !== null && preg_match('/^\d{5}$/', $raw) === 1) {
            return $raw;
        }
        if (preg_match('/^\d{5}$/', $handle) === 1) {
            return $handle;
        }
        return null;
    }

    private static function load(array $response): PublicKeyCredential
    {
        $loaded = self::serializer()->denormalize($response, PublicKeyCredential::class, 'json');
        if (!$loaded instanceof PublicKeyCredential) {
            throw new \RuntimeException('bad credential');
        }
        return $loaded;
    }

    private static function record(array $credential): CredentialRecord
    {
        $aaguid = $credential['aaguid'];
        if (!is_string($aaguid) || !Uuid::isValid($aaguid)) {
            $aaguid = '00000000-0000-0000-0000-000000000000';
        }
        return CredentialRecord::create(
            self::raw($credential['credentialId']),
            PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
            $credential['transports'],
            'none',
            EmptyTrustPath::create(),
            Uuid::fromString($aaguid),
            self::raw($credential['publicKey']),
            (string) $credential['userHandle'],
            (int) $credential['counter'],
            null,
            is_bool($credential['backupEligible']) ? $credential['backupEligible'] : null,
            is_bool($credential['backupStatus']) ? $credential['backupStatus'] : null,
            is_bool($credential['uvInitialized']) ? $credential['uvInitialized'] : null,
        );
    }

    private static function factory(string $origin): CeremonyStepManagerFactory
    {
        $algorithms = Manager::create()->add(ES256::create(), RS256::create());
        $factory = new CeremonyStepManagerFactory();
        $factory->setAllowedOrigins([$origin], false);
        $factory->setAttestationStatementSupportManager(new AttestationStatementSupportManager([
            new PackedAttestationStatementSupport($algorithms),
            new AppleAttestationStatementSupport(),
            new AndroidKeyAttestationStatementSupport(),
            new FidoU2FAttestationStatementSupport(),
            new TPMAttestationStatementSupport(),
        ]));
        return $factory;
    }

    private static function serializer(): SerializerInterface
    {
        if (self::$serializer instanceof SerializerInterface) {
            return self::$serializer;
        }
        $algorithms = Manager::create()->add(ES256::create(), RS256::create());
        $manager = new AttestationStatementSupportManager([
            new PackedAttestationStatementSupport($algorithms),
            new AppleAttestationStatementSupport(),
            new AndroidKeyAttestationStatementSupport(),
            new FidoU2FAttestationStatementSupport(),
            new TPMAttestationStatementSupport(),
        ]);
        self::$serializer = (new WebauthnSerializerFactory($manager))->create();
        return self::$serializer;
    }

    private static function tryRaw(string $value): ?string
    {
        try {
            return self::raw($value);
        } catch (Throwable) {
            return null;
        }
    }
}
