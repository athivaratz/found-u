<?php

declare(strict_types=1);

namespace Foundu;

use PDO;
use Throwable;

// One connection per worker, not a persistent PDO handle. Persistent handles
// are left off so a shared host does not pile them up past max_user_connections.
// The static cache would otherwise keep a user variable and an open
// transaction into the next request on PHP-FPM. releaseRequestState() clears
// both at the end of the request.
// Statements here must run on MariaDB 10.11 and 11.x.
final class Database
{
    private static ?PDO $pdo = null;
    private static int $privilegeDepth = 0;

    public static function connection(array $config): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        self::$pdo = self::connect($config);
        return self::$pdo;
    }

    public static function connect(array $config): PDO
    {
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
            PDO::ATTR_PERSISTENT => false,
            PDO::ATTR_TIMEOUT => 3,
        ];
        if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
            $options[PDO::MYSQL_ATTR_CONNECT_TIMEOUT] = 3;
        }
        if (defined('PDO::MYSQL_ATTR_MULTI_STATEMENTS')) {
            $options[PDO::MYSQL_ATTR_MULTI_STATEMENTS] = false;
        }

        $pdo = new PDO($dsn, $user, $pass, $options);
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
        return $pdo;
    }

    public static function disconnect(): void
    {
        self::$pdo = null;
        self::$privilegeDepth = 0;
    }

    public static function releaseRequestState(): void
    {
        $pdo = self::$pdo;
        self::$privilegeDepth = 0;
        if (!$pdo instanceof PDO) {
            return;
        }
        try {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
                Log::get()->warning('rolled back an open transaction at end of request');
            }
        } catch (Throwable $e) {
            Log::get()->error('could not roll back at end of request', ['class' => $e::class]);
        }
        try {
            $pdo->exec('SET @foundu_allow_privileged = 0');
        } catch (Throwable $e) {
            Log::get()->error('could not clear privileged flag', ['class' => $e::class]);
        }
    }

    public static function run(PDO $pdo, string $sql, array $params = []): \PDOStatement
    {
        if (preg_match('/;\s*\S/', $sql) === 1) {
            throw new \RuntimeException('refusing multiple statements');
        }
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        return $statement;
    }

    // Sets the accounts guard flag for the callback, then clears it.
    // User variables are not rolled back, so the clear sits in finally.
    public static function privileged(PDO $pdo, callable $work): mixed
    {
        self::$privilegeDepth++;
        if (self::$privilegeDepth === 1) {
            $pdo->exec('SET @foundu_allow_privileged = 1');
        }
        try {
            return $work($pdo);
        } finally {
            self::$privilegeDepth--;
            if (self::$privilegeDepth === 0) {
                $pdo->exec('SET @foundu_allow_privileged = 0');
            }
        }
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
