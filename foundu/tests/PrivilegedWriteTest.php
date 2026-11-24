<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Database;
use PDO;
use PDOException;

final class PrivilegedWriteTest extends DbTestCase
{
    public function testRoleChangeNeedsTheFlagAndTheFlagDoesNotStick(): void
    {
        $id = $this->account('admin', '11111');

        try {
            Database::run($this->pdo, 'UPDATE accounts SET role = \'user\' WHERE id = ?', [$id]);
            $this->fail('expected the guard to reject the update');
        } catch (PDOException $e) {
            $this->assertStringContainsString('account change is not allowed', $e->getMessage());
        }
        $flag = $this->pdo->query('SELECT IFNULL(@foundu_allow_privileged, 0)')->fetchColumn();
        $this->assertSame('0', (string) $flag);

        Database::privileged($this->pdo, function (PDO $pdo) use ($id): void {
            Database::run($pdo, 'UPDATE accounts SET role = \'user\' WHERE id = ?', [$id]);
        });
        $role = Database::run($this->pdo, 'SELECT role FROM accounts WHERE id = ?', [$id])->fetchColumn();
        $this->assertSame('user', $role);
        $flag = $this->pdo->query('SELECT IFNULL(@foundu_allow_privileged, 0)')->fetchColumn();
        $this->assertSame('0', (string) $flag);
    }

    public function testAThrownWriteStillClearsTheFlag(): void
    {
        $id = $this->account('user', '10003');
        try {
            Database::privileged($this->pdo, function (PDO $pdo) use ($id): void {
                Database::run($pdo, 'UPDATE accounts SET role = \'admin\' WHERE id = ?', [$id]);
                throw new \RuntimeException('stop');
            });
            $this->fail('expected the callback to throw');
        } catch (\RuntimeException $e) {
            $this->assertSame('stop', $e->getMessage());
        }
        $flag = $this->pdo->query('SELECT IFNULL(@foundu_allow_privileged, 0)')->fetchColumn();
        $this->assertSame('0', (string) $flag);

        try {
            Database::run($this->pdo, 'UPDATE accounts SET student_id = \'10009\' WHERE id = ?', [$id]);
            $this->fail('flag should already be off');
        } catch (PDOException $e) {
            $this->assertStringContainsString('account change is not allowed', $e->getMessage());
        }
    }

    public function testProfileUpdateDoesNotNeedTheFlag(): void
    {
        $id = $this->account();
        Database::run($this->pdo, 'UPDATE accounts SET shown_name = ? WHERE id = ?', ['Desk', $id]);
        $name = Database::run($this->pdo, 'SELECT shown_name FROM accounts WHERE id = ?', [$id])->fetchColumn();
        $this->assertSame('Desk', $name);
    }
}
