<?php

declare(strict_types=1);

// Creates the first admin. Prints SQL for phpMyAdmin, or inserts it when
// --apply is passed and a database is reachable. The host has no shell, so
// the usual path is: run this on your own machine, paste the SQL.

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "create-admin.php is command-line only\n");
    exit(1);
}

$appRoot = dirname(__DIR__);
$autoload = $appRoot . '/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "vendor/autoload.php is missing. Run composer install on the build machine.\n");
    exit(1);
}
require $autoload;

use Foundu\Auth\PasswordHash;
use Foundu\Config;
use Foundu\Database;

$studentId = '';
$password = getenv('FOUNDU_ADMIN_PASSWORD');
if ($password === false) {
    $password = '';
}
$first = 'Admin';
$last = 'Found-U';
$nickname = 'Admin';
$apply = false;
$database = null;

foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--apply') {
        $apply = true;
        continue;
    }
    $pair = explode('=', $arg, 2);
    if (count($pair) !== 2 || strncmp($pair[0], '--', 2) !== 0) {
        usage();
    }
    $key = substr($pair[0], 2);
    $value = $pair[1];
    if ($key === 'student-id') {
        $studentId = $value;
    } elseif ($key === 'password') {
        $password = $value;
    } elseif ($key === 'first-name') {
        $first = $value;
    } elseif ($key === 'last-name') {
        $last = $value;
    } elseif ($key === 'nickname') {
        $nickname = $value;
    } elseif ($key === 'database') {
        $database = $value;
    } else {
        usage();
    }
}

$studentId = trim($studentId);
if (!preg_match('/^\d{5}$/', $studentId)) {
    fwrite(STDERR, "Student id must be exactly 5 digits.\n");
    exit(1);
}
if ($password === '') {
    fwrite(STDERR, "Set FOUNDU_ADMIN_PASSWORD or pass --password=. Prefer the env var so the secret stays out of shell history.\n");
    exit(1);
}
if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    fwrite(STDERR, "Password needs at least 8 characters, one letter, and one digit.\n");
    exit(1);
}
if (strlen($password) > 128) {
    fwrite(STDERR, "Password is longer than 128 bytes.\n");
    exit(1);
}

$first = clean_name($first, 'Admin');
$last = clean_name($last, 'Found-U');
$nickname = clean_name($nickname, 'Admin');
$display = trim($first . ' ' . $last);

try {
    $hash = PasswordHash::hash($password);
} catch (Throwable $e) {
    fwrite(STDERR, "Could not hash the password.\n");
    exit(1);
}
if (PasswordHash::isBcrypt($hash) && strlen($password) > 72) {
    fwrite(STDERR, "This PHP is using bcrypt, which ignores bytes after 72. Shorten the password.\n");
    exit(1);
}

$config = Config::load($appRoot);
$domain = trim((string) ($config['SCHOOL_AUTH_DOMAIN'] ?? ''));
if ($domain === '' || $domain === '-' || $domain === '—') {
    $domain = 'local';
}
if (!preg_match('/^[A-Za-z0-9.-]+$/', $domain)) {
    fwrite(STDERR, "SCHOOL_AUTH_DOMAIN must be a hostname, or empty.\n");
    exit(1);
}
$email = $studentId . '@students.' . $domain;
$id = uuid_v4();

if ($database !== null) {
    if (!preg_match('/^[A-Za-z0-9_]+$/', $database)) {
        fwrite(STDERR, "Database name must be letters, digits, and underscore.\n");
        exit(1);
    }
    $config['DB_NAME'] = $database;
}

if ($apply) {
    try {
        $pdo = Database::connection($config);
        $count = Database::privileged($pdo, static function (PDO $pdo) use (
            $id, $studentId, $email, $display, $first, $last, $nickname, $hash
        ): int {
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO accounts (
                        id, student_id, linked_uid, email, display_name, first_name, last_name, nickname,
                        role, current_password_hash, school_password_hash, is_student_verified, is_registered,
                        status, auth_methods, passkey_credentials
                     ) SELECT
                        ?, ?, ?, ?, ?, ?, ?, ?,
                        \'admin\', ?, ?, 1, 1,
                        \'active\', JSON_ARRAY(\'password\'), JSON_ARRAY()
                     FROM DUAL
                     WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE student_id = ? OR id = ?)'
                );
                $stmt->execute([
                    $id, $studentId, $id, $email, $display, $first, $last, $nickname,
                    $hash, $hash,
                    $studentId, $id,
                ]);
                $written = $stmt->rowCount();
                $pdo->commit();
                return $written;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        });
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fwrite(STDERR, "Insert failed. If the schema is missing, import migrations first.\n");
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }
    if ($count < 1) {
        fwrite(STDERR, "An account with that student id already exists.\n");
        exit(1);
    }
    fwrite(STDOUT, "created admin {$studentId} {$id}\n");
    exit(0);
}

$q = static function (string $value): string {
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $value) . "'";
};

fwrite(STDOUT, <<<SQL
-- Generated by foundu/bin/create-admin.php. Do not commit this output.
-- Paste it into phpMyAdmin after the schema import. A second paste does nothing.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET @foundu_allow_privileged = 1;

INSERT INTO accounts (
  id, student_id, linked_uid, email, display_name, first_name, last_name, nickname,
  role, current_password_hash, school_password_hash, is_student_verified, is_registered,
  status, auth_methods, passkey_credentials
)
SELECT
  {$q($id)}, {$q($studentId)}, {$q($id)}, {$q($email)}, {$q($display)}, {$q($first)}, {$q($last)}, {$q($nickname)},
  'admin', {$q($hash)}, {$q($hash)}, 1, 1,
  'active', JSON_ARRAY('password'), JSON_ARRAY()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE student_id = {$q($studentId)} OR id = {$q($id)}
);

SET @foundu_allow_privileged = NULL;

SQL);
exit(0);

function usage(): void
{
    fwrite(STDERR, "Usage: FOUNDU_ADMIN_PASSWORD='…' php create-admin.php --student-id=11111 [--first-name=] [--last-name=] [--nickname=] [--apply] [--database=name]\n");
    exit(1);
}

function clean_name(string $value, string $fallback): string
{
    $value = trim(preg_replace('/[\x00-\x1F\x7F]/', '', $value) ?? '');
    if ($value === '') {
        return $fallback;
    }
    if (strlen($value) > 100) {
        fwrite(STDERR, "Name is too long.\n");
        exit(1);
    }
    return $value;
}

function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}
