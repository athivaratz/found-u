<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Foundu\Cache\Store;

$dir = sys_get_temp_dir() . '/foundu-cache-check-' . getmypid();
mkdir($dir);

$file = new Store($dir, false);
if ($file->backend() !== 'file') {
    fwrite(STDERR, "expected file backend\n");
    exit(1);
}
$file->set('k', 'v', 30);
if ($file->get('k') !== 'v') {
    fwrite(STDERR, "file roundtrip failed\n");
    exit(1);
}

$auto = new Store($dir, true);
$backend = $auto->backend();
if ($backend !== 'apcu' && $backend !== 'file') {
    fwrite(STDERR, "unexpected backend {$backend}\n");
    exit(1);
}
$auto->set('k2', 'v2', 30);
if ($auto->get('k2') !== 'v2') {
    fwrite(STDERR, "auto roundtrip failed\n");
    exit(1);
}

fwrite(STDOUT, "cache {$backend}\n");
