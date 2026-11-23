<?php

declare(strict_types=1);

$appRoot = dirname(__DIR__);
$lists = require $appRoot . '/config/cloudflare-ips.php';
$expected = array_values(array_merge($lists['v4'], $lists['v6']));
sort($expected);

$htaccess = dirname($appRoot) . '/public_html/.htaccess';
$text = file_get_contents($htaccess);
if ($text === false) {
    fwrite(STDERR, "missing {$htaccess}\n");
    exit(1);
}
preg_match_all('/^\s*Require\s+ip\s+(\S+)\s*$/m', $text, $matches);
$found = $matches[1];
sort($found);

if ($found !== $expected) {
    fwrite(STDERR, "Cloudflare IP list drifted between .htaccess and config/cloudflare-ips.php\n");
    exit(1);
}

fwrite(STDOUT, "cf-ips " . count($found) . "\n");
