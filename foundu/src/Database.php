<?php

declare(strict_types=1);

namespace Foundu;

use PDO;

// One connection per request. Persistent PDO is off so a shared host does
// not pile up sessions against max_user_connections.
// Statements here must run on MariaDB 10.11 and 11.x.
final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(array $config): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $host = (string) ($config['DB_HOST'] ?? 'localhost');
        $port = (int) ($config['DB_PORT'] ?? 3306);
        $name = (string) ($config['DB_NAME'] ?? '');
        $user = (string) ($config['DB_USER'] ?? '');
        $pass = (string) ($config['DB_PASS'] ?? '');
        $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4';

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 3,
        ];
        if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
            $options[PDO::MYSQL_ATTR_CONNECT_TIMEOUT] = 3;
        }

        $pdo = new PDO($dsn, $user, $pass, $options);
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("SET time_zone = '+00:00'");
        self::$pdo = $pdo;
        return $pdo;
    }

    public static function ping(PDO $pdo): string
    {
        $value = $pdo->query('SELECT 1')->fetchColumn();
        if ((string) $value !== '1') {
            throw new \RuntimeException('database ping failed');
        }
        $version = $pdo->query('SELECT VERSION()')->fetchColumn();
        return is_string($version) ? $version : '';
    }
}
