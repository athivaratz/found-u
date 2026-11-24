<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Install\Attempts;
use Foundu\Install\Bag;
use Foundu\Install\EnvFile;
use Foundu\Install\Front;
use Foundu\Install\Lock;
use Foundu\Install\SqlScript;
use PHPUnit\Framework\TestCase;

final class InstallTest extends TestCase
{
    private string $home;

    /** @var array<string, mixed> */
    private array $session = [];

    protected function setUp(): void
    {
        Front::$probe = static fn (string $url): bool => true;
        $this->home = sys_get_temp_dir() . '/foundu-install-' . bin2hex(random_bytes(4));
        mkdir($this->home . '/foundu/config', 0700, true);
        mkdir($this->home . '/foundu/storage', 0700, true);
        mkdir($this->home . '/foundu/migrations', 0700, true);
        mkdir($this->home . '/public_html/install', 0700, true);
        file_put_contents($this->home . '/public_html/install/index.php', "<?php\necho \"installer\";\n");
        file_put_contents(
            $this->home . '/foundu/config/cloudflare-ips.php',
            "<?php\nreturn ['v4' => ['203.0.113.0/24'], 'v6' => []];\n"
        );
        file_put_contents(
            $this->home . '/public_html/.user.ini',
            "memory_limit = 256M\nsession.upload_progress.enabled = 0\n"
        );
        $this->session = [];
    }

    protected function tearDown(): void
    {
        Front::$probe = null;
        $this->remove($this->home);
    }

    public function testLockedInstallerIsNotFound(): void
    {
        $app = $this->app();
        file_put_contents(Lock::envPath($app), "<?php\nreturn [];\n");
        file_put_contents(Lock::lockPath($app), "installed\n");
        file_put_contents(Lock::tokenPath($app), bin2hex(random_bytes(32)) . "\n");

        $page = $this->call('GET');
        $this->assertSame(404, $page['status']);
        $this->assertSame("Not Found\n", $page['body']);
        $this->assertStringNotContainsString('โทเค็น', $page['body']);
        $this->assertStringNotContainsString('ติดตั้ง', $page['body']);
    }

    public function testTokenAndCsrf(): void
    {
        $app = $this->app();
        $token = bin2hex(random_bytes(32));
        file_put_contents(Lock::tokenPath($app), $token . "\n");

        $page = $this->call('GET');
        $this->assertSame(200, $page['status']);
        $this->assertStringContainsString('install-token.txt', $page['body']);
        $this->assertStringContainsString('action="/install/"', $page['body']);
        $csrf = $this->csrf($page['body']);

        $wrong = str_repeat('ab', 32);
        $bad = $this->call('POST', ['step' => 'token', 'token' => $wrong, 'csrf' => $csrf]);
        $this->assertSame(200, $bad['status']);
        $this->assertStringContainsString('โทเค็นไม่ตรง', $bad['body']);
        $this->assertStringNotContainsString($wrong, $bad['body']);

        $missing = $this->call('POST', ['step' => 'token', 'token' => $token, 'csrf' => 'nope']);
        $this->assertStringContainsString('หมดอายุ', $missing['body']);
        $this->assertStringNotContainsString($token, $missing['body']);

        $ok = $this->call('POST', ['step' => 'token', 'token' => $token, 'csrf' => $csrf]);
        $this->assertSame(200, $ok['status']);
        $this->assertStringContainsString('ใช้เครื่องนี้ต่อ', $ok['body']);
        $this->assertStringNotContainsString($token, $ok['body']);
    }

    public function testTokenAttemptsAreLimited(): void
    {
        $app = $this->app();
        $token = bin2hex(random_bytes(32));
        file_put_contents(Lock::tokenPath($app), $token . "\n");
        $csrf = $this->csrf($this->call('GET')['body']);
        $wrong = str_repeat('cd', 32);
        for ($i = 0; $i < Attempts::MAX_FAILS; $i++) {
            $page = $this->call('POST', ['step' => 'token', 'token' => $wrong, 'csrf' => $csrf]);
            $this->assertSame(200, $page['status'], 'failure ' . $i);
        }
        $blocked = $this->call('POST', ['step' => 'token', 'token' => $token, 'csrf' => $csrf]);
        $this->assertSame(429, $blocked['status']);
        $this->assertStringNotContainsString($token, $blocked['body']);
        $this->assertGreaterThan(60, (int) ($blocked['headers']['Retry-After'] ?? '0'));
    }

    public function testEnvFileIsMode600AndSecretsStayOutOfHtml(): void
    {
        $app = $this->app();
        $secret = 'db-secret-should-not-echo';
        $this->session = [
            'csrf' => str_repeat('a', 32),
            'authed' => true,
            'created_at' => time(),
            'preflight_ok' => true,
            'import_done' => true,
            'db' => [
                'host' => 'localhost',
                'port' => '3306',
                'name' => 'foundu',
                'user' => 'foundu',
                'pass' => $secret,
            ],
        ];
        $page = $this->call('POST', [
            'step' => 'config',
            'csrf' => str_repeat('a', 32),
            'app_url' => 'http://localhost:8080',
            'fill_later' => '1',
            'skip_ai' => '1',
        ]);
        $this->assertSame(200, $page['status']);
        $this->assertStringContainsString('สร้างผู้ดูแล', $page['body']);
        $this->assertStringNotContainsString($secret, $page['body']);

        $path = Lock::envPath($app);
        $this->assertSame(0600, EnvFile::mode($path));
        $loaded = require $path;
        $this->assertIsArray($loaded);
        $this->assertSame($secret, $loaded['DB_PASS']);
        $this->assertGreaterThanOrEqual(32, strlen((string) $loaded['APP_KEY']));
        $this->assertStringNotContainsString((string) $loaded['APP_KEY'], $page['body']);
        $this->assertSame('0', $loaded['TURNSTILE_ENABLED']);
    }

    public function testFinishRemovesTheTokenAndTheInstaller(): void
    {
        $app = $this->app();
        $token = bin2hex(random_bytes(32));
        file_put_contents(Lock::tokenPath($app), $token . "\n");
        file_put_contents(Lock::envPath($app), "<?php\nreturn ['APP_KEY' => 'not-shown'];\n");
        chmod(Lock::envPath($app), 0600);
        $this->session = [
            'csrf' => str_repeat('b', 32),
            'authed' => true,
            'created_at' => time(),
            'preflight_ok' => true,
            'import_done' => true,
            'config_done' => true,
            'admin_done' => true,
            'admin_id' => '11111',
            'db' => ['host' => 'localhost', 'port' => '3306', 'name' => 'foundu', 'user' => 'foundu', 'pass' => 'still-a-secret'],
        ];
        $page = $this->call('POST', ['step' => 'finish', 'csrf' => str_repeat('b', 32)]);
        $this->assertSame(200, $page['status']);
        $this->assertStringContainsString('*/5 * * * * php ~/foundu/bin/cron.php', $page['body']);
        $this->assertStringContainsString('/cloudflare-checklist.html', $page['body']);
        $this->assertStringNotContainsString('still-a-secret', $page['body']);
        $this->assertStringNotContainsString($token, $page['body']);
        $this->assertFileDoesNotExist(Lock::tokenPath($app));
        $this->assertFileDoesNotExist($this->home . '/public_html/install/index.php');
        $this->assertFileExists(Lock::lockPath($app));

        $again = $this->call('GET');
        $this->assertSame(404, $again['status']);
        $this->assertSame("Not Found\n", $again['body']);
    }

    public function testSqlSplitterKeepsATriggerTogether(): void
    {
        $sql = "DELIMITER $$\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW\nBEGIN\n  SET x = 1;\nEND$$\nDELIMITER ;\nSELECT 1;\n";
        $parts = SqlScript::split($sql);
        $this->assertCount(2, $parts);
        $this->assertStringContainsString('BEGIN', $parts[0]);
        $this->assertStringContainsString('END', $parts[0]);
        $this->assertSame('SELECT 1', $parts[1]);
    }

    public function testHtaccessPublishesInstallWithoutAPhpUrl(): void
    {
        $text = (string) file_get_contents(dirname(__DIR__, 2) . '/public_html/.htaccess');
        $this->assertStringContainsString('RewriteRule ^install/?$ install/index.php [END]', $text);
        $this->assertStringContainsString('!^/api/index\\.php$', $text);
    }

    /**
     * @param array<string, string> $post
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    private function call(string $method, array $post = []): array
    {
        $bag = new Bag($this->session);
        return Front::handle($this->app(), $bag, $post, [], [
            'REQUEST_METHOD' => $method,
            'REMOTE_ADDR' => '203.0.113.10',
        ]);
    }

    private function app(): string
    {
        return $this->home . '/foundu';
    }

    private function csrf(string $html): string
    {
        $this->assertSame(1, preg_match('/name="csrf" value="([a-f0-9]+)"/', $html, $match));
        return $match[1];
    }

    private function remove(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }
        $items = scandir($path);
        if ($items === false) {
            return;
        }
        foreach ($items as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $full = $path . '/' . $name;
            if (is_dir($full)) {
                $this->remove($full);
            } else {
                @unlink($full);
            }
        }
        @rmdir($path);
    }
}
