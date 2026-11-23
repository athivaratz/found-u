<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Cms\Doc;
use Foundu\Cms\Html;
use Foundu\Cron\CloudflareList;
use Foundu\Http\HttpError;
use Foundu\Seo\Document;
use Foundu\Seo\OgImage;
use Foundu\Storage\R2Put;
use Foundu\Storage\SigV4;
use PHPUnit\Framework\TestCase;

final class P10UnitTest extends TestCase
{
    public function testSanitizerDropsActiveContent(): void
    {
        $clean = Html::fragment(
            '<p>สวัสดี</p><script>alert(1)</script><img src=x onerror=alert(1)>'
            . '<a href="javascript:alert(1)">bad</a>'
            . '<a href="JaVaScRiPt:alert(1)">bad2</a>'
            . '<a href="&#106;avascript:alert(1)">bad3</a>'
            . '<a href="https://example.com/a">ok</a>'
            . '<svg onload="alert(1)"><script>alert(2)</script></svg>'
        );
        $this->assertStringContainsString('<p>สวัสดี</p>', $clean);
        $this->assertStringContainsString('href="https://example.com/a"', $clean);
        $this->assertStringNotContainsString('<script', strtolower($clean));
        $this->assertStringNotContainsString('onerror', strtolower($clean));
        $this->assertStringNotContainsString('onload', strtolower($clean));
        $this->assertStringNotContainsString('javascript:', strtolower($clean));
        $this->assertSame('a < b และ c > d', Html::fragment('a < b และ c > d'));

        $doc = Doc::clean([
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [[
                        'type' => 'text',
                        'text' => 'ไป',
                        'marks' => [[
                            'type' => 'link',
                            'attrs' => ['href' => 'javascript:alert(1)', 'target' => '_blank'],
                        ]],
                    ]],
                ],
                ['type' => 'image', 'attrs' => ['src' => 'javascript:alert(1)']],
                ['type' => 'html', 'content' => [['type' => 'text', 'text' => '<script>']]],
            ],
        ]);
        $this->assertArrayNotHasKey('marks', $doc['content'][0]['content'][0]);
        $this->assertCount(1, $doc['content']);
    }

    public function testMetaInjectionReplacesHeadTags(): void
    {
        $shell = '<!DOCTYPE html><html><head><title>เก่า</title>'
            . '<meta name="description" content="เก่า">'
            . '<meta property="og:title" content="เก่า">'
            . '</head><body><div id="__next"></div></body></html>';
        $html = Document::inject($shell, [
            'found' => true,
            'title' => 'กระเป๋า & <tag>',
            'description' => 'รายละเอียด "โรงเรียน"',
            'canonical' => 'http://localhost:8080/blog/how-bags',
            'type' => 'article',
            'image' => 'http://localhost:8080/og/blog/how-bags.png',
            'imageAlt' => 'กระเป๋า',
        ]);
        $this->assertStringContainsString('<title>กระเป๋า &amp; &lt;tag&gt;</title>', $html);
        $this->assertStringContainsString('content="รายละเอียด &quot;โรงเรียน&quot;"', $html);
        $this->assertStringContainsString('rel="canonical" href="http://localhost:8080/blog/how-bags"', $html);
        $this->assertStringContainsString('property="og:image" content="http://localhost:8080/og/blog/how-bags.png"', $html);
        $this->assertStringContainsString('name="twitter:card" content="summary_large_image"', $html);
        $this->assertStringNotContainsString('<title>เก่า</title>', $html);
        $this->assertStringNotContainsString('content="เก่า"', $html);
        $this->assertStringContainsString('<div id="__next">', $html);
        $this->assertSame(1, substr_count($html, '<title>'));
    }

    public function testOgImageIsPngAndCached(): void
    {
        $root = dirname(__DIR__);
        $first = OgImage::file($root, 'แจ้งของหายที่โรงอาหาร', 'ระบบของโรงเรียน');
        $second = OgImage::file($root, 'แจ้งของหายที่โรงอาหาร', 'ระบบของโรงเรียน');
        $other = OgImage::file($root, 'คนละเรื่อง', 'ระบบของโรงเรียน');
        $this->assertSame($first, $second);
        $this->assertNotSame($first, $other);
        $bytes = (string) file_get_contents($first);
        $this->assertStringStartsWith("\x89PNG", $bytes);
        $this->assertGreaterThan(2000, strlen($bytes));
    }

    public function testCloudflareListRejectsABadDownload(): void
    {
        $dir = sys_get_temp_dir() . '/foundu-cf-' . bin2hex(random_bytes(4));
        mkdir($dir);
        $htaccess = $dir . '/.htaccess';
        $php = $dir . '/cloudflare-ips.php';
        file_put_contents($htaccess, "# BEGIN foundu-cloudflare-ips\n    Require ip 173.245.48.0/20\n# END foundu-cloudflare-ips\nRewriteRule ^api(?:/.*)?$ api/index.php [END,QSA]\n");
        file_put_contents($php, "<?php\nreturn ['v4' => ['173.245.48.0/20'], 'v6' => []];\n");
        $before = file_get_contents($htaccess);
        try {
            CloudflareList::refresh($htaccess, $php, $dir . '/stamp', time(), static function (string $url): string {
                if (str_contains($url, 'ips-v4')) {
                    return "10.0.0.0/4\n";
                }
                return "2400:cb00::/32\n";
            });
            $this->fail('a short prefix should not replace the list');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('validation', $e->getMessage());
        }
        $this->assertSame($before, file_get_contents($htaccess));

        $line = CloudflareList::refresh($htaccess, $php, $dir . '/stamp', time(), static function (string $url): string {
            if (str_contains($url, 'ips-v4')) {
                return "173.245.48.0/20\n104.16.0.0/13\n103.21.244.0/22\n141.101.64.0/18\n";
            }
            return "2400:cb00::/32\n2606:4700::/32\n2a06:98c0::/29\n";
        });
        $this->assertSame('cf-ips 7', $line);
        $text = (string) file_get_contents($htaccess);
        $this->assertStringContainsString('Require ip 104.16.0.0/13', $text);
        $this->assertStringContainsString('RewriteRule ^api', $text);
        $loaded = require $php;
        $this->assertContains('104.16.0.0/13', $loaded['v4']);
        $this->assertContains('2a06:98c0::/29', $loaded['v6']);
    }

    public function testSigV4HeaderIsStable(): void
    {
        $one = self::signed('hello');
        $two = self::signed('hello');
        $other = self::signed('other');
        $this->assertSame($one, $two);
        $this->assertNotSame($one, $other);
        $this->assertStringContainsString('Credential=access/20261123/auto/s3/aws4_request', $one);

        $dir = sys_get_temp_dir() . '/foundu-r2-' . bin2hex(random_bytes(3));
        mkdir($dir);
        $file = $dir . '/dump.sql.gz';
        file_put_contents($file, 'gzip-bytes');
        $seen = [];
        $put = new R2Put('account', 'access', 'secret', 'bucket', static function (string $url, array $headers, string $path) use (&$seen, $file): int {
            $seen = [$url, $headers, $path];
            return 200;
        });
        $put->putFile('backups/foundu.sql.gz', 'application/gzip', $file);
        $this->assertSame('https://account.r2.cloudflarestorage.com/bucket/backups/foundu.sql.gz', $seen[0]);
        $this->assertSame(hash_file('sha256', $file), $seen[1]['x-amz-content-sha256']);
        $this->assertSame($file, $seen[2]);
        $this->assertNull(R2Put::fromConfig(['R2_ACCOUNT_ID' => '', 'R2_ACCESS_KEY_ID' => 'a', 'R2_SECRET_ACCESS_KEY' => 'b', 'R2_BUCKET_NAME' => 'c']));
    }

    private static function signed(string $body): string
    {
        $hash = hash('sha256', $body);
        return SigV4::authorization(
            'PUT',
            '/bucket/backups/foundu.sql.gz',
            '',
            'abc.r2.cloudflarestorage.com',
            [
                'content-type' => 'application/gzip',
                'x-amz-content-sha256' => $hash,
                'x-amz-date' => '20261123T000000Z',
            ],
            $hash,
            'access',
            'secret',
            'auto',
            '20261123T000000Z'
        );
    }

    public function testDocRejectsANonDocument(): void
    {
        $this->expectException(HttpError::class);
        Doc::clean(['type' => 'html', 'content' => []]);
    }
}
