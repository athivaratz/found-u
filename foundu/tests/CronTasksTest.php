<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Cron\SqlDump;
use Foundu\Cron\Tasks;
use Foundu\Database;
use Foundu\Ids;
use PDO;

final class CronTasksTest extends DbTestCase
{
    private string $stamp;

    private ?string $previousStamp = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->stamp = dirname(__DIR__) . '/storage/cache/cf-ips-refreshed';
        $this->previousStamp = is_file($this->stamp) ? (string) file_get_contents($this->stamp) : null;
        file_put_contents($this->stamp, (string) time());
        $this->pdo->exec('DELETE FROM articles');
        $this->pdo->exec('DELETE FROM found_items');
        $this->pdo->exec('DELETE FROM agent_chat_logs');
    }

    protected function tearDown(): void
    {
        if ($this->previousStamp === null) {
            @unlink($this->stamp);
        } else {
            file_put_contents($this->stamp, $this->previousStamp);
        }
        parent::tearDown();
    }

    public function testExpireAndChatPurgeStayInsideTheRun(): void
    {
        $user = $this->account('user', '34001');
        $old = Ids::uuid();
        $fresh = Ids::uuid();
        $found = Ids::uuid();
        Database::run(
            $this->pdo,
            'INSERT INTO found_items (id, tracking_code, description, location_found, status, handover_deadline_at)
             VALUES (?, ?, ?, ?, \'pending_room_confirm\', ?)',
            [$found, 'FOUND-P10AA', 'กระเป๋า', 'สนาม', Ids::utc(time() - 3600)]
        );
        Database::run(
            $this->pdo,
            'INSERT INTO agent_chat_logs (id, user_id, provider, created_at) VALUES (?, ?, \'test\', ?)',
            [$old, $user, Ids::utc(time() - 8 * 86400)]
        );
        Database::run(
            $this->pdo,
            'INSERT INTO agent_chat_logs (id, user_id, provider, created_at) VALUES (?, ?, \'test\', ?)',
            [$fresh, $user, Ids::utc(time() - 3600)]
        );

        $config = $this->config();
        $config['R2_ACCOUNT_ID'] = '';
        $config['R2_ACCESS_KEY_ID'] = '';
        $config['R2_SECRET_ACCESS_KEY'] = '';
        $config['R2_BUCKET_NAME'] = '';
        $lines = Tasks::run($this->pdo, $config, dirname(__DIR__), time());
        $text = implode("\n", $lines);
        $this->assertStringContainsString('expired 1', $text);
        $this->assertStringContainsString('chat_logs 1', $text);
        $this->assertStringContainsString('cf-ips skipped', $text);
        $this->assertStringContainsString('dump skipped', $text);

        $status = Database::run($this->pdo, 'SELECT status FROM found_items WHERE id = ?', [$found])->fetchColumn();
        $this->assertSame('expired', $status);
        $left = Database::run($this->pdo, 'SELECT id FROM agent_chat_logs ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertSame([$fresh], $left);
    }

    public function testDumpRestoresADeletedRow(): void
    {
        $id = Ids::uuid();
        Database::run(
            $this->pdo,
            'INSERT INTO articles (id, slug, section, status, title, tags, content_json) VALUES (?, ?, \'blog\', \'draft\', ?, JSON_ARRAY(), JSON_OBJECT(\'type\', \'doc\', \'content\', JSON_ARRAY()))',
            [$id, 'dump-' . substr($id, 0, 8), 'ก่อนดัมป์']
        );
        $path = sys_get_temp_dir() . '/foundu-dump-' . bin2hex(random_bytes(4)) . '.sql.gz';
        try {
            SqlDump::write($this->pdo, $path, time() + 30);
            Database::run($this->pdo, 'DELETE FROM articles WHERE id = ?', [$id]);
            $this->assertFalse(Database::run($this->pdo, 'SELECT id FROM articles WHERE id = ?', [$id])->fetch());
            SqlDump::restore($this->pdo, $path);
            $title = Database::run($this->pdo, 'SELECT title FROM articles WHERE id = ?', [$id])->fetchColumn();
            $this->assertSame('ก่อนดัมป์', $title);
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
}
