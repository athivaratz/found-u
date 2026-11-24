<?php

// Single PHP entry. Other .php files are forbidden by .htaccess.
// This file stays on old syntax so the version guard can answer on its own.

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
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo '{"ok":false,"error":"app_missing"}';
    exit;
}

require $appRoot . '/src/Platform.php';

$bootError = Foundu\Platform::bootError();
if ($bootError !== null) {
    $message = 'refusing to boot: ' . $bootError['error'];
    if (isset($bootError['php'])) {
        $message .= ' php=' . $bootError['php'] . ' min=' . $bootError['min_php'];
    }
    error_log($message);
    $autoload = $appRoot . '/vendor/autoload.php';
    if (is_file($autoload)) {
        try {
            require $autoload;
            Foundu\Log::get()->error($message);
        } catch (Throwable $e) {
            error_log('logger unavailable');
        }
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo json_encode($bootError);
    exit;
}

$autoload = $appRoot . '/vendor/autoload.php';
if (!is_file($autoload)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo '{"ok":false,"error":"app_missing"}';
    exit;
}

require $autoload;

Foundu\Kernel::create($appRoot)->run();
