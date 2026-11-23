<?php

declare(strict_types=1);

// Short load sample against local docker, with the CPU and memory limits
// in docker-compose.limits.yml. Run it from a dev machine:
//
//   docker compose -f docker-compose.yml -f docker-compose.limits.yml up -d --force-recreate web
//   php tools/load.php
//
// Do not aim this at VisperHost.

$base = rtrim(getenv('BASE_URL') ?: 'http://127.0.0.1:8080', '/');
$seconds = (int) (getenv('LOAD_SECONDS') ?: 8);
$concurrency = (int) (getenv('LOAD_CONCURRENCY') ?: 4);
$root = dirname(__DIR__);

clearLimits($root);

$etag = '';
$probe = curlOne('GET', $base . '/api/changes?tables=lost_items');
if (preg_match('/ETag:\\s*("?[^"\\r\\n]+"?)/i', $probe['header'], $m)) {
    $etag = trim($m[1]);
}

$loginBody = json_encode([
    'studentId' => '88001',
    'password' => 'Password1',
], JSON_UNESCAPED_UNICODE);

$plans = [
    'static' => ['GET', $base . '/', null, []],
    'changes_304' => ['GET', $base . '/api/changes?tables=lost_items', null, $etag !== '' ? ['If-None-Match: ' . $etag] : []],
    'search' => ['GET', $base . '/api/search?type=lost&q=' . rawurlencode('กระเป๋า'), null, []],
    'item' => ['GET', $base . '/api/lost-items/88000000-0000-4000-8000-000000000011', null, []],
    'login' => ['POST', $base . '/api/auth/login', $loginBody, ['Content-Type: application/json']],
];

$report = [];
foreach ($plans as $name => $plan) {
    $report[$name] = run($name, $plan[0], $plan[1], $plan[2], $plan[3], $seconds, $name === 'login' ? 2 : $concurrency);
}

echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";

function clearLimits(string $root): void
{
    $sql = "DELETE FROM rate_limits; DELETE FROM login_attempts WHERE student_id = '88001';\n";
    $cmd = 'docker compose exec -T mariadb mariadb --default-character-set=utf8mb4 -ufoundu -pfoundu_dev foundu';
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root);
    if (!is_resource($proc)) {
        return;
    }
    fwrite($pipes[0], $sql);
    fclose($pipes[0]);
    stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
}

function run(string $name, string $method, string $url, ?string $body, array $headers, int $seconds, int $concurrency): array
{
    $mh = curl_multi_init();
    $active = [];
    $samples = [];
    $statuses = [];
    $started = microtime(true);
    $stop = $started + $seconds;

    $add = static function () use ($mh, &$active, $method, $url, $body, $headers): void {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        curl_multi_add_handle($mh, $ch);
        $active[(int) $ch] = $ch;
    };

    for ($i = 0; $i < $concurrency; $i++) {
        $add();
    }

    do {
        $state = curl_multi_exec($mh, $running);
        if ($state > CURLM_OK) {
            break;
        }
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $time = (float) curl_getinfo($ch, CURLINFO_TOTAL_TIME);
            $samples[] = $time * 1000;
            $statuses[$status] = ($statuses[$status] ?? 0) + 1;
            curl_multi_remove_handle($mh, $ch);
            unset($active[(int) $ch]);
            curl_close($ch);
            if (microtime(true) < $stop) {
                $add();
            }
        }
        if ($running) {
            curl_multi_select($mh, 0.2);
        }
    } while ($running || $active !== []);

    curl_multi_close($mh);
    sort($samples);
    $n = count($samples);
    $elapsed = max(0.001, microtime(true) - $started);
    return [
        'requests' => $n,
        'seconds' => round($elapsed, 2),
        'rps' => round($n / $elapsed, 2),
        'p50_ms' => $n === 0 ? null : round(percentile($samples, 0.50), 1),
        'p95_ms' => $n === 0 ? null : round(percentile($samples, 0.95), 1),
        'statuses' => $statuses,
    ];
}

function percentile(array $sorted, float $p): float
{
    $n = count($sorted);
    if ($n === 0) {
        return 0.0;
    }
    $rank = (int) ceil($p * $n) - 1;
    $rank = max(0, min($n - 1, $rank));
    return (float) $sorted[$rank];
}

function curlOne(string $method, string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($ch);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $raw = is_string($raw) ? $raw : '';
    return ['header' => substr($raw, 0, $headerSize), 'body' => substr($raw, $headerSize)];
}
