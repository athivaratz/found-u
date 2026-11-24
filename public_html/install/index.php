<?php

// Web installer. Open /install and the token in foundu/install-token.txt.
// Once config/.env.php and config/install.lock both exist, this answers 404.
// Kept on old syntax up to the version check so an old PHP can explain itself.

@ini_set('session.upload_progress.enabled', '0');
@ini_set('display_errors', '0');

if (PHP_VERSION_ID < 80236) {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex');
    echo '<!DOCTYPE html><html lang="th"><meta charset="utf-8"><title>ติดตั้ง Found-U</title><body><h1>PHP เก่าเกินไป</h1><p>ตอนนี้เป็น ';
    echo htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8');
    echo ' แอปต้องการอย่างน้อย 8.2.36 และควรเป็น 8.3 หรือ 8.4</p><p>ถามโฮสต์: ใน DirectAdmin เปิด Select PHP Version แล้วเลือก 8.3 หรือ 8.4</p></body></html>';
    exit;
}

$appRoot = null;
$dir = __DIR__;
for ($i = 0; $i < 6; $i++) {
    $parent = dirname($dir);
    if ($parent === $dir) {
        break;
    }
    if (is_file($parent . '/foundu/vendor/autoload.php')) {
        $appRoot = $parent . '/foundu';
        break;
    }
    $dir = $parent;
}

if ($appRoot === null) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: private, no-store');
    echo "ไม่พบโฟลเดอร์ foundu ข้าง public_html\n";
    exit;
}

require $appRoot . '/vendor/autoload.php';

Foundu\Install\Front::run($appRoot);
