<?php

// PNG for /og/blog/{slug}.png, /og/help/{slug}.png, and the old
// /blog/{slug}/opengraph-image path. Same boot rules as meta.php.

@ini_set('session.upload_progress.enabled', '0');
@ini_set('session.upload_progress.cleanup', '0');

$appRoot = null;
$dir = __DIR__;
for ($i = 0; $i < 6; $i++) {
    $parent = dirname($dir);
    if ($parent === $dir) {
        break;
    }
    $dir = $parent;
    if (is_file($dir . '/foundu/src/Platform.php')) {
        $appRoot = $dir . '/foundu';
        break;
    }
}

if ($appRoot === null) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo 'unavailable';
    exit;
}

require $appRoot . '/src/Platform.php';

$bootError = Foundu\Platform::bootError();
if ($bootError !== null) {
    error_log('refusing to boot og');
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo 'unavailable';
    exit;
}

$autoload = $appRoot . '/vendor/autoload.php';
if (!is_file($autoload)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo 'unavailable';
    exit;
}

require $autoload;

Foundu\Seo\Front::image($appRoot);
