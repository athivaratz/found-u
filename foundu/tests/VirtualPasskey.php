<?php

declare(strict_types=1);

namespace Foundu\Tests;

use CBOR\ByteStringObject;
use CBOR\MapObject;
use CBOR\NegativeIntegerObject;
use CBOR\TextStringObject;
use CBOR\UnsignedIntegerObject;
use Cose\Algorithm\Signature\ECDSA\ES256;
use Cose\Key\Ec2Key;
use Cose\Key\Key;

// A software authenticator for the passkey tests. It speaks the same JSON
// @simplewebauthn/browser would post back: base64url fields, fmt "none".
final class VirtualPasskey
{
    private function __construct(
        private readonly string $d,
        private readonly string $x,
        private readonly string $y,
        private readonly string $credentialId,
        private int $counter,
    ) {
    }

    public static function generate(): self
    {
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        if ($key === false) {
            throw new \RuntimeException('openssl key');
        }
        $details = openssl_pkey_get_details($key);
        if (!is_array($details) || !isset($details['ec'])) {
            throw new \RuntimeException('openssl details');
        }
        return new self(
            self::pad($details['ec']['d']),
            self::pad($details['ec']['x']),
            self::pad($details['ec']['y']),
            random_bytes(16),
            0
        );
    }

    public function register(string $challenge, string $origin, string $rpId): array
    {
        $this->counter++;
        $auth = $this->authData($rpId, true);
        $attestation = (string) MapObject::create()
            ->add(TextStringObject::create('fmt'), TextStringObject::create('none'))
            ->add(TextStringObject::create('attStmt'), MapObject::create())
            ->add(TextStringObject::create('authData'), ByteStringObject::create($auth));
        return [
            'id' => self::b64($this->credentialId),
            'rawId' => self::b64($this->credentialId),
            'type' => 'public-key',
            'response' => [
                'clientDataJSON' => self::b64($this->client('webauthn.create', $challenge, $origin)),
                'attestationObject' => self::b64($attestation),
                'transports' => ['internal'],
            ],
        ];
    }

    public function login(string $challenge, string $origin, string $rpId, string $userHandle): array
    {
        $this->counter++;
        $client = $this->client('webauthn.get', $challenge, $origin);
        $auth = $this->authData($rpId, false);
        $signed = $auth . hash('sha256', $client, true);
        $signature = ES256::create()->sign($signed, Ec2Key::create([
            Key::TYPE => Key::TYPE_EC2,
            Key::ALG => ES256::ID,
            Ec2Key::DATA_CURVE => Ec2Key::CURVE_P256,
            Ec2Key::DATA_X => $this->x,
            Ec2Key::DATA_Y => $this->y,
            Ec2Key::DATA_D => $this->d,
        ]));
        return [
            'id' => self::b64($this->credentialId),
            'rawId' => self::b64($this->credentialId),
            'type' => 'public-key',
            'response' => [
                'clientDataJSON' => self::b64($client),
                'authenticatorData' => self::b64($auth),
                'signature' => self::b64($signature),
                'userHandle' => self::b64($userHandle),
            ],
            'clientExtensionResults' => [],
        ];
    }

    private function authData(string $rpId, bool $create): string
    {
        $flags = $create ? "\x41" : "\x01";
        $body = hash('sha256', $rpId, true) . $flags . pack('N', $this->counter);
        if (!$create) {
            return $body;
        }
        $cose = (string) MapObject::create()
            ->add(UnsignedIntegerObject::create(1), UnsignedIntegerObject::create(2))
            ->add(UnsignedIntegerObject::create(3), NegativeIntegerObject::create(-7))
            ->add(NegativeIntegerObject::create(-1), UnsignedIntegerObject::create(1))
            ->add(NegativeIntegerObject::create(-2), ByteStringObject::create($this->x))
            ->add(NegativeIntegerObject::create(-3), ByteStringObject::create($this->y));
        return $body . str_repeat("\0", 16) . pack('n', strlen($this->credentialId)) . $this->credentialId . $cose;
    }

    private function client(string $type, string $challenge, string $origin): string
    {
        return json_encode([
            'type' => $type,
            'challenge' => $challenge,
            'origin' => $origin,
            'crossOrigin' => false,
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private static function pad(string $value): string
    {
        return str_pad($value, 32, "\0", STR_PAD_LEFT);
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
