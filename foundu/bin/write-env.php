<?php

declare(strict_types=1);

// Used by the docker entrypoint. The file it writes is for the local
// MariaDB only. Copy .env.php.example on the host instead of uploading this.

$appRoot = dirname(__DIR__);
$target = $appRoot . '/config/.env.php';
if (is_file($target)) {
    fwrite(STDERR, ".env.php already exists\n");
    exit(0);
}

$envOr = static function (string $key, string $default): string {
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
};

$key = $envOr('APP_KEY', '');
if ($key === '') {
    $key = base64_encode(random_bytes(32));
}

$values = [
    'APP_ENV' => $envOr('APP_ENV', 'local'),
    'APP_URL' => $envOr('APP_URL', 'http://localhost:8080'),
    'APP_KEY' => $key,
    'DB_HOST' => $envOr('DB_HOST', 'mariadb'),
    'DB_PORT' => $envOr('DB_PORT', '3306'),
    'DB_NAME' => $envOr('DB_NAME', 'foundu'),
    'DB_USER' => $envOr('DB_USER', 'foundu'),
    'DB_PASS' => $envOr('DB_PASS', 'foundu_dev'),
    'SCHOOL_AUTH_DOMAIN' => $envOr('SCHOOL_AUTH_DOMAIN', ''),
    'R2_ACCOUNT_ID' => $envOr('R2_ACCOUNT_ID', ''),
    'R2_ACCESS_KEY_ID' => $envOr('R2_ACCESS_KEY_ID', ''),
    'R2_SECRET_ACCESS_KEY' => $envOr('R2_SECRET_ACCESS_KEY', ''),
    'R2_BUCKET_NAME' => $envOr('R2_BUCKET_NAME', ''),
    'R2_PUBLIC_BASE_URL' => $envOr('R2_PUBLIC_BASE_URL', ''),
    'GEMINI_API_KEY' => $envOr('GEMINI_API_KEY', ''),
    'OPENROUTER_API_KEY' => $envOr('OPENROUTER_API_KEY', ''),
    'OPENROUTER_MODEL' => $envOr('OPENROUTER_MODEL', ''),
    'TURNSTILE_SITE_KEY' => $envOr('TURNSTILE_SITE_KEY', ''),
    'TURNSTILE_SECRET' => $envOr('TURNSTILE_SECRET', ''),
    'TURNSTILE_ENABLED' => $envOr('TURNSTILE_ENABLED', ''),
    'AI_MAX_CONCURRENCY' => $envOr('AI_MAX_CONCURRENCY', '3'),
    'AI_SLOT_LEASE_SECONDS' => $envOr('AI_SLOT_LEASE_SECONDS', '60'),
    'AI_QUOTA_PER_MINUTE' => $envOr('AI_QUOTA_PER_MINUTE', '5'),
    'AI_QUOTA_PER_HOUR' => $envOr('AI_QUOTA_PER_HOUR', '30'),
    'AI_SYSTEM_QUOTA_PER_MINUTE' => $envOr('AI_SYSTEM_QUOTA_PER_MINUTE', '20'),
    'AI_SYSTEM_QUOTA_PER_HOUR' => $envOr('AI_SYSTEM_QUOTA_PER_HOUR', '100'),
    'RATE_LIMIT_API_PER_MINUTE' => $envOr('RATE_LIMIT_API_PER_MINUTE', '120'),
    'RATE_LIMIT_AUTH_PER_MINUTE' => $envOr('RATE_LIMIT_AUTH_PER_MINUTE', '10'),
    'RATE_LIMIT_PRESIGN_PER_HOUR' => $envOr('RATE_LIMIT_PRESIGN_PER_HOUR', '20'),
    'SESSION_IDLE_SECONDS' => $envOr('SESSION_IDLE_SECONDS', '1800'),
    'SESSION_ABSOLUTE_SECONDS' => $envOr('SESSION_ABSOLUTE_SECONDS', '43200'),
    'BODY_MAX_BYTES' => $envOr('BODY_MAX_BYTES', '262144'),
    'BODY_MAX_AI_BYTES' => $envOr('BODY_MAX_AI_BYTES', '65536'),
    'LOGIN_LOCK_ACCOUNT_LIMIT' => $envOr('LOGIN_LOCK_ACCOUNT_LIMIT', '5'),
    'LOGIN_LOCK_ACCOUNT_SECONDS' => $envOr('LOGIN_LOCK_ACCOUNT_SECONDS', '900'),
    'LOGIN_LOCK_IP_LIMIT' => $envOr('LOGIN_LOCK_IP_LIMIT', '20'),
    'LOGIN_LOCK_IP_SECONDS' => $envOr('LOGIN_LOCK_IP_SECONDS', '3600'),
    'SEARCH_SIMILARITY_THRESHOLD' => $envOr('SEARCH_SIMILARITY_THRESHOLD', '0.15'),
    'AGENT_SEARCH_SIMILARITY_THRESHOLD' => $envOr('AGENT_SEARCH_SIMILARITY_THRESHOLD', '0.30'),
];

$export = var_export($values, true);
$php = <<<PHP
<?php

declare(strict_types=1);

// Generated for local docker. Do not upload this file.
// On the host, copy config/.env.php.example, fill it in, and chmod 600.

return {$export};

PHP;

if (file_put_contents($target, $php) === false) {
    fwrite(STDERR, "could not write .env.php\n");
    exit(1);
}
chmod($target, 0600);
fwrite(STDOUT, "wrote {$target}\n");
