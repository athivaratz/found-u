<?php

declare(strict_types=1);

// Light checks against a local docker site. Run this on a dev machine.
// Do not point it at the shared host: VisperHost's terms forbid load tests.
//
//   php tools/attack.php
//   BASE_URL=http://127.0.0.1:8080 php tools/attack.php
//
// Expects `docker compose up` with the default rate limits (120/min API,
// 10/min auth, 5 bad passwords then a 15 minute lock).

$base = rtrim(getenv('BASE_URL') ?: 'http://127.0.0.1:8080', '/');
$root = dirname(__DIR__);

prepare($root);

$results = [];
$results['login_lockout'] = loginLockout($base);
$results['oversized'] = oversized($base);
sleep(65);
$results['scan_404'] = scan404($base);
    sleep(65);
    $results['changes_burst'] = changesBurst($base);
    // The burst above fills the 120/minute bucket. Wait for it to drain
    // so the AI check is not just another 429.
    sleep(65);
    $results['ai_without_turnstile'] = aiWithoutTurnstile($base, $root);

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";

function prepare(string $root): void
{
    $hash = password_hash('Password1', PASSWORD_ARGON2ID, [
        'memory_cost' => 65536,
        'time_cost' => 4,
        'threads' => 1,
    ]);
    if (!is_string($hash)) {
        fwrite(STDERR, "password_hash failed\n");
        exit(1);
    }
    $sql = <<<SQL
SET @foundu_allow_privileged = 1;
DELETE FROM login_attempts;
DELETE FROM rate_limits;
DELETE FROM lost_items WHERE tracking_code IN ('LOST-ATK001');
DELETE FROM accounts WHERE student_id IN ('88001', '88002');
INSERT INTO accounts (
    id, student_id, linked_uid, email, display_name, nickname, role, status, ban_status,
    is_student_verified, is_registered, has_logged_in_once, current_password_hash,
    auth_methods, passkey_credentials
) VALUES
('88000000-0000-4000-8000-000000000001', '88001', '88000000-0000-4000-8000-000000000001', '88001@students.local', 'โจมตี', 'โจมตี', 'user', 'active', 'none', 1, 1, 1, '{$hash}', JSON_ARRAY('password'), JSON_ARRAY()),
('88000000-0000-4000-8000-000000000002', '88002', '88000000-0000-4000-8000-000000000002', '88002@students.local', 'เอไอ', 'เอไอ', 'user', 'active', 'none', 1, 1, 1, '{$hash}', JSON_ARRAY('password'), JSON_ARRAY());
INSERT INTO lost_items (id, tracking_code, item_name, category, description, location_lost, contacts, user_id, student_id, status)
VALUES ('88000000-0000-4000-8000-000000000011', 'LOST-ATK001', 'กระเป๋าทดสอบ', 'bag', 'สีดำ', 'โรงอาหาร', JSON_ARRAY(JSON_OBJECT('type','phone','value','0810000000')), '88000000-0000-4000-8000-000000000001', '88001', 'searching');
SET @foundu_allow_privileged = 0;
SQL;
    $cmd = 'docker compose exec -T mariadb mariadb --default-character-set=utf8mb4 -ufoundu -pfoundu_dev foundu';
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root);
    if (!is_resource($proc)) {
        fwrite(STDERR, "could not prepare the database\n");
        exit(1);
    }
    fwrite($pipes[0], $sql);
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    if ($code !== 0) {
        fwrite(STDERR, $err . $out);
        exit(1);
    }
}

function loginLockout(string $base): array
{
    $codes = [];
    for ($i = 0; $i < 6; $i++) {
        $res = request('POST', $base . '/api/auth/login', [
            'studentId' => '88001',
            'password' => 'Wrongpass1',
        ]);
        $codes[] = $res['status'];
    }
    return [
        'statuses' => $codes,
        'locked' => ($codes[5] ?? 0) === 429,
        'note' => 'Five wrong passwords, then the sixth answer should be 429.',
    ];
}

function oversized(string $base): array
{
    $medium = request('POST', $base . '/api/lost-items', ['pad' => str_repeat('a', 300000)]);
    $huge = request('POST', $base . '/api/lost-items', ['pad' => str_repeat('b', 1700000)]);
    return [
        'bytes_300k' => $medium['status'],
        'bytes_1_7m' => $huge['status'],
        'note' => '300 KiB is over the PHP cap and should be 413 JSON. 1.7 MiB is over Apache LimitRequestBody.',
    ];
}

function scan404(string $base): array
{
    $codes = [];
    for ($i = 0; $i < 140; $i++) {
        $res = request('GET', $base . '/api/no-such-' . $i);
        $codes[$res['status']] = ($codes[$res['status']] ?? 0) + 1;
    }
    return [
        'counts' => $codes,
        'limited' => ($codes[429] ?? 0) > 0,
    ];
}

function changesBurst(string $base): array
{
    $codes = [];
    for ($i = 0; $i < 140; $i++) {
        $res = request('GET', $base . '/api/changes?tables=lost_items');
        $codes[$res['status']] = ($codes[$res['status']] ?? 0) + 1;
    }
    return [
        'counts' => $codes,
        'limited' => ($codes[429] ?? 0) > 0,
    ];
}

function aiWithoutTurnstile(string $base, string $root): array
{
    $env = $root . '/foundu/config/.env.php';
    $original = is_file($env) ? (string) file_get_contents($env) : '';
    $patched = $original;
    if (!str_contains($patched, "'TURNSTILE_SECRET'")) {
        fwrite(STDERR, "TURNSTILE_SECRET missing from .env.php\n");
        return ['status' => 0, 'blocked' => false];
    }
    $patched = preg_replace(
        "/'TURNSTILE_SECRET'\\s*=>\\s*'[^']*'/",
        "'TURNSTILE_SECRET' => '1x0000000000000000000000000000000AA'",
        $patched,
        1
    );
    file_put_contents($env, (string) $patched);
    try {
        // Login has its own Turnstile check. The dummy secret above
        // accepts any token, so this only proves the password works.
        // The chat call below sends no token.
        $login = request('POST', $base . '/api/auth/login', [
            'studentId' => '88002',
            'password' => 'Password1',
            'turnstileToken' => 'attack-dummy-token',
        ]);
        $chat = request('POST', $base . '/api/agent/chat', [
            'messages' => [['role' => 'user', 'content' => 'สวัสดี']],
        ], $login['cookies'], true);
        return [
            'login' => $login['status'],
            'chat' => $chat['status'],
            'error' => $chat['json']['error'] ?? null,
            'blocked' => $chat['status'] === 403,
        ];
    } finally {
        if ($original !== '') {
            file_put_contents($env, $original);
        }
    }
}

function request(string $method, string $url, ?array $json = null, array $cookies = [], bool $csrf = false): array
{
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($json !== null) {
        $body = json_encode($json, JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    if ($csrf && isset($cookies['foundu_csrf'])) {
        $headers[] = 'X-CSRF-Token: ' . $cookies['foundu_csrf'];
    }
    if ($cookies !== []) {
        $pairs = [];
        foreach ($cookies as $name => $value) {
            $pairs[] = $name . '=' . $value;
        }
        curl_setopt($ch, CURLOPT_COOKIE, implode('; ', $pairs));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $raw = is_string($raw) ? $raw : '';
    $header = substr($raw, 0, $headerSize);
    $body = substr($raw, $headerSize);
    $decoded = json_decode($body, true);
    $set = [];
    if (preg_match_all('/^Set-Cookie:\\s*([^=]+)=([^;\\r\\n]*)/mi', $header, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $set[$match[1]] = $match[2];
        }
    }
    return [
        'status' => $status,
        'json' => is_array($decoded) ? $decoded : null,
        'cookies' => $set,
    ];
}
