<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Foundu\Http\ClientAddress;
use Foundu\Platform;

if (Platform::MIN_PHP_VERSION_ID !== 80236 || Platform::MIN_PHP_VERSION !== '8.2.36') {
    fwrite(STDERR, "php minimum drifted\n");
    exit(1);
}
if (Platform::acceptsMariaDb('10.11.19-MariaDB')) {
    fwrite(STDERR, "10.11.19 should be refused\n");
    exit(1);
}
if (!Platform::acceptsMariaDb('10.11.20-MariaDB-ubu2204')) {
    fwrite(STDERR, "10.11.20 should be accepted\n");
    exit(1);
}
if (Platform::acceptsMariaDb('10.6.28-MariaDB')) {
    fwrite(STDERR, "10.6 should be refused\n");
    exit(1);
}
if (!Platform::acceptsMariaDb('11.4.14-MariaDB')) {
    fwrite(STDERR, "11.4.14 should be accepted\n");
    exit(1);
}
if (Platform::acceptsMariaDb('11.4.13-MariaDB')) {
    fwrite(STDERR, "11.4.13 should be refused\n");
    exit(1);
}

$ranges = ClientAddress::ranges(dirname(__DIR__));

$trusted = ClientAddress::resolve([
    'REMOTE_ADDR' => '173.245.48.10',
    'HTTP_CF_CONNECTING_IP' => '203.0.113.9',
    'HTTP_CF_IPCOUNTRY' => 'th',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.8',
], 'production', false, $ranges);
if ($trusted->ip !== '203.0.113.9' || $trusted->country !== 'TH' || !$trusted->fromCloudflare || $trusted->mock) {
    fwrite(STDERR, "cloudflare peer was not trusted\n");
    exit(1);
}

$spoof = ClientAddress::resolve([
    'REMOTE_ADDR' => '198.51.100.1',
    'HTTP_CF_CONNECTING_IP' => '203.0.113.9',
    'HTTP_X_FORWARDED_FOR' => '203.0.113.10',
], 'production', false, $ranges);
if ($spoof->ip !== '198.51.100.1' || $spoof->fromCloudflare || $spoof->country !== null) {
    fwrite(STDERR, "non-cloudflare peer trusted a header\n");
    exit(1);
}

$mock = ClientAddress::resolve([
    'REMOTE_ADDR' => '127.0.0.1',
    'HTTP_X_MOCK_CF_EDGE_IP' => '173.245.48.10',
    'HTTP_X_MOCK_CF_CONNECTING_IP' => '203.0.113.9',
    'HTTP_X_MOCK_CF_IPCOUNTRY' => 'jp',
    'HTTP_X_FORWARDED_FOR' => '198.51.100.8',
], 'local', true, $ranges);
if ($mock->ip !== '203.0.113.9' || $mock->country !== 'JP' || !$mock->fromCloudflare || !$mock->mock) {
    fwrite(STDERR, "local mock did not apply the real rule\n");
    exit(1);
}

$prodMock = ClientAddress::resolve([
    'REMOTE_ADDR' => '127.0.0.1',
    'HTTP_X_MOCK_CF_EDGE_IP' => '173.245.48.10',
    'HTTP_X_MOCK_CF_CONNECTING_IP' => '203.0.113.9',
], 'production', true, $ranges);
if ($prodMock->ip !== '127.0.0.1' || $prodMock->mock || $prodMock->fromCloudflare) {
    fwrite(STDERR, "production honored mock headers\n");
    exit(1);
}

fwrite(STDOUT, "client-address ok\n");
