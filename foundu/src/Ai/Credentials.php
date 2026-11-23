<?php

declare(strict_types=1);

namespace Foundu\Ai;

use Foundu\Database;
use Foundu\Http\HttpError;
use PDO;

// A row in ai_credentials wins over env for that provider when the box
// decrypts. Students never select this table. Responses from the admin
// routes are flags only; this object holds plaintext and must not be logged.
final class Credentials
{
    public function __construct(
        public readonly ?string $gemini,
        public readonly ?string $openrouter,
        public readonly string $openrouterModel,
        public readonly string $provider,
        public readonly string $source,
        public readonly ?string $configuredAt,
    ) {
    }

    public static function load(PDO $pdo, array $config): self
    {
        $row = Database::run(
            $pdo,
            'SELECT provider, gemini_ciphertext, gemini_nonce, openrouter_ciphertext, openrouter_nonce, openrouter_model, configured_at
             FROM ai_credentials WHERE id = \'default\' LIMIT 1',
            []
        )->fetch();
        $envGemini = self::envKey($config, 'GEMINI_API_KEY');
        $envOpen = self::envKey($config, 'OPENROUTER_API_KEY');
        $envModel = trim((string) ($config['OPENROUTER_MODEL'] ?? ''));
        if ($envModel === '') {
            $envModel = 'google/gemini-2.0-flash-exp:free';
        }
        if (!is_array($row)) {
            return self::fromKeys($envGemini, $envOpen, $envModel, null, 'auto', $envGemini !== null || $envOpen !== null ? 'env' : 'none', null);
        }
        $key = null;
        $gemini = null;
        $open = null;
        $fromDb = false;
        if (is_string($row['gemini_ciphertext'] ?? null) && $row['gemini_ciphertext'] !== '') {
            $fromDb = true;
            $key = SecretBox::key($config);
            $gemini = SecretBox::open((string) $row['gemini_ciphertext'], (string) ($row['gemini_nonce'] ?? ''), $key);
        } else {
            $gemini = $envGemini;
        }
        if (is_string($row['openrouter_ciphertext'] ?? null) && $row['openrouter_ciphertext'] !== '') {
            $fromDb = true;
            $key ??= SecretBox::key($config);
            $open = SecretBox::open((string) $row['openrouter_ciphertext'], (string) ($row['openrouter_nonce'] ?? ''), $key);
        } else {
            $open = $envOpen;
        }
        $model = trim((string) ($row['openrouter_model'] ?? ''));
        if ($model === '') {
            $model = $envModel;
        }
        $provider = (string) ($row['provider'] ?? 'auto');
        if (!in_array($provider, ['auto', 'gemini', 'openrouter', 'none'], true)) {
            $provider = 'auto';
        }
        $at = $row['configured_at'] ?? null;
        return self::fromKeys(
            $gemini,
            $open,
            $model,
            $provider,
            $provider,
            $fromDb ? 'database' : ($gemini !== null || $open !== null ? 'env' : 'none'),
            is_string($at) && $at !== '' ? $at : null
        );
    }

    public function order(): array
    {
        $haveGemini = $this->gemini !== null;
        $haveOpen = $this->openrouter !== null;
        if ($this->provider === 'none') {
            return [];
        }
        if ($this->provider === 'gemini') {
            return $haveGemini ? ['gemini'] : [];
        }
        if ($this->provider === 'openrouter') {
            return $haveOpen ? ['openrouter'] : [];
        }
        $order = [];
        if ($haveGemini) {
            $order[] = 'gemini';
        }
        if ($haveOpen) {
            $order[] = 'openrouter';
        }
        return $order;
    }

    public function flags(): array
    {
        return [
            'provider' => $this->provider,
            'openrouterModel' => $this->openrouterModel,
            'hasGeminiKey' => $this->gemini !== null,
            'hasOpenrouterKey' => $this->openrouter !== null,
            'configuredAt' => $this->configuredAt === null ? null : self::iso($this->configuredAt),
        ];
    }

    public static function placeholder(string $value): bool
    {
        $trim = trim($value);
        if ($trim === '') {
            return true;
        }
        return preg_match('/^[•*.\s]+$/u', $trim) === 1;
    }

    public static function save(PDO $pdo, array $config, array $patch): self
    {
        $current = self::load($pdo, $config);
        $stored = self::stored($pdo, $config);
        $provider = $current->provider;
        if (isset($patch['provider'])) {
            $provider = (string) $patch['provider'];
            if (!in_array($provider, ['auto', 'gemini', 'openrouter', 'none'], true)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'provider']);
            }
        }
        $model = $current->openrouterModel;
        if (isset($patch['openrouterModel']) && is_string($patch['openrouterModel']) && trim($patch['openrouterModel']) !== '') {
            $model = trim($patch['openrouterModel']);
            if (strlen($model) > 191) {
                throw new HttpError(400, 'invalid_input', ['field' => 'openrouterModel']);
            }
        }
        // A key that lives only in env stays in env. Rotate is the request that
        // may copy it into the table so the nonce is ours.
        $keepGemini = $stored['gemini'];
        $keepOpen = $stored['openrouter'];
        if (($patch['rotateStored'] ?? false) === true) {
            $keepGemini = $stored['gemini'] ?? $current->gemini;
            $keepOpen = $stored['openrouter'] ?? $current->openrouter;
        }
        $gemini = self::boxed($patch['geminiApiKey'] ?? null, $keepGemini);
        $open = self::boxed($patch['openrouterApiKey'] ?? null, $keepOpen);
        if ($gemini === null && $open === null && !isset($patch['provider']) && !isset($patch['openrouterModel'])) {
            throw new HttpError(400, 'invalid_input', ['field' => 'apiKey']);
        }
        $key = ($gemini !== null || $open !== null) ? SecretBox::key($config) : '';
        $geminiBox = $gemini === null ? [null, null] : self::pack($gemini, $key);
        $openBox = $open === null ? [null, null] : self::pack($open, $key);
        $pdo->beginTransaction();
        try {
            Database::run($pdo, 'DELETE FROM ai_credentials WHERE id = \'default\'', []);
            Database::run(
                $pdo,
                'INSERT INTO ai_credentials (
                    id, provider, gemini_ciphertext, gemini_nonce, openrouter_ciphertext, openrouter_nonce, openrouter_model, configured_at
                 ) VALUES (\'default\', ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',
                [$provider, $geminiBox[0], $geminiBox[1], $openBox[0], $openBox[1], $model]
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof HttpError) {
                throw $e;
            }
            throw new HttpError(500, 'server_error');
        }
        return self::load($pdo, $config);
    }

    private static function stored(PDO $pdo, array $config): array
    {
        $row = Database::run(
            $pdo,
            'SELECT gemini_ciphertext, gemini_nonce, openrouter_ciphertext, openrouter_nonce FROM ai_credentials WHERE id = \'default\' LIMIT 1',
            []
        )->fetch();
        $gemini = null;
        $open = null;
        if (is_array($row)) {
            $needsKey = (is_string($row['gemini_ciphertext'] ?? null) && $row['gemini_ciphertext'] !== '')
                || (is_string($row['openrouter_ciphertext'] ?? null) && $row['openrouter_ciphertext'] !== '');
            $key = $needsKey ? SecretBox::key($config) : '';
            if (is_string($row['gemini_ciphertext'] ?? null) && $row['gemini_ciphertext'] !== '') {
                $gemini = SecretBox::open((string) $row['gemini_ciphertext'], (string) ($row['gemini_nonce'] ?? ''), $key);
            }
            if (is_string($row['openrouter_ciphertext'] ?? null) && $row['openrouter_ciphertext'] !== '') {
                $open = SecretBox::open((string) $row['openrouter_ciphertext'], (string) ($row['openrouter_nonce'] ?? ''), $key);
            }
        }
        return ['gemini' => $gemini, 'openrouter' => $open];
    }

    private static function boxed(mixed $incoming, ?string $current): ?string
    {
        if ($incoming === null) {
            return $current;
        }
        if (!is_string($incoming) || self::placeholder($incoming)) {
            return $current;
        }
        $text = trim($incoming);
        if (strlen($text) < 8 || strlen($text) > 512) {
            throw new HttpError(400, 'invalid_input', ['field' => 'apiKey']);
        }
        if (preg_match('/[\x00-\x1F]/', $text) === 1) {
            throw new HttpError(400, 'invalid_input', ['field' => 'apiKey']);
        }
        return $text;
    }

    private static function pack(string $plain, string $key): array
    {
        $sealed = SecretBox::seal($plain, $key);
        return [$sealed['cipher'], $sealed['nonce']];
    }

    private static function fromKeys(
        ?string $gemini,
        ?string $open,
        string $model,
        ?string $provider,
        string $fallbackProvider,
        string $source,
        ?string $configuredAt,
    ): self {
        if ($provider === null) {
            if ($gemini !== null && $open !== null) {
                $provider = 'auto';
            } elseif ($gemini !== null) {
                $provider = 'gemini';
            } elseif ($open !== null) {
                $provider = 'openrouter';
            } else {
                $provider = 'none';
            }
        }
        if ($provider === '') {
            $provider = $fallbackProvider;
        }
        return new self($gemini, $open, $model, $provider, $source, $configuredAt);
    }

    private static function envKey(array $config, string $name): ?string
    {
        $value = trim((string) ($config[$name] ?? ''));
        return $value === '' ? null : $value;
    }

    private static function iso(string $value): string
    {
        $iso = \Foundu\Data\Time::iso($value);
        return $iso ?? $value;
    }
}
