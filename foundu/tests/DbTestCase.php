<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Config;
use Foundu\Database;
use Foundu\Ids;
use PDO;
use PHPUnit\Framework\TestCase;

abstract class DbTestCase extends TestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        if (getenv('FOUNDU_TEST_DB') !== '1') {
            $this->markTestSkipped('Set FOUNDU_TEST_DB=1 and point DB_* at a migrated database.');
        }
        $this->pdo = Database::connect($this->config());
        $this->pdo->exec('SET @foundu_allow_privileged = 0');
        foreach ([
            'ai_slots',
            'ai_usage',
            'sessions',
            'login_attempts',
            'error_logs',
            'activity_logs',
            'rate_limits',
            'cron_lock',
        ] as $table) {
            $this->pdo->exec('DELETE FROM ' . $table);
        }
        Database::privileged($this->pdo, function (PDO $pdo): void {
            $pdo->exec('DELETE FROM accounts');
        });
    }

    protected function tearDown(): void
    {
        if (isset($this->pdo)) {
            Database::releaseRequestState();
            $this->pdo->exec('SET @foundu_allow_privileged = 0');
        }
        Database::disconnect();
    }

    protected function config(): array
    {
        $config = Config::load(dirname(__DIR__));
        foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'APP_ENV', 'APP_URL'] as $key) {
            $value = getenv($key);
            if ($value !== false && $value !== '') {
                $config[$key] = $value;
            }
        }
        return $config;
    }

    protected function account(string $role = 'user', string $studentId = '10001'): string
    {
        $id = Ids::uuid();
        Database::privileged($this->pdo, function (PDO $pdo) use ($id, $role, $studentId): void {
            Database::run(
                $pdo,
                'INSERT INTO accounts (
                    id, student_id, linked_uid, email, display_name, role, status, ban_status,
                    is_student_verified, is_registered, auth_methods, passkey_credentials
                 ) VALUES (?, ?, ?, ?, ?, ?, \'active\', \'none\', 1, 1, JSON_ARRAY(\'password\'), JSON_ARRAY())',
                [$id, $studentId, $id, $studentId . '@students.local', 'Test', $role]
            );
        });
        return $id;
    }
}
