<?php

declare(strict_types=1);

namespace Foundu\Install;

use Foundu\Http\ClientAddress;
use Foundu\Platform;

// What the host has to provide before the schema is imported. A "fail" stops
// the next step. A "warn" is something to fix, and the person can continue.
final class Preflight
{
    /**
     * @param callable(string): bool|null $probe
     * @return array{blocked: bool, checks: list<array{id: string, level: string, title: string, detail: string, ask: string}>}
     */
    public static function collect(string $appRoot, array $server, ?callable $probe = null): array
    {
        $probe ??= [Probe::class, 'reach'];
        $checks = [];
        $checks[] = self::phpVersion();
        foreach (self::extensions() as $check) {
            $checks[] = $check;
        }
        $checks[] = self::memory();
        $checks[] = self::executionTime();
        $checks[] = self::uploadSizes();
        $checks[] = self::uploadProgress();
        $checks[] = self::writable($appRoot);
        $checks[] = self::userIni($appRoot);
        foreach (self::outbound($probe) as $check) {
            $checks[] = $check;
        }
        $checks[] = self::cloudflare($appRoot, $server);
        $blocked = false;
        foreach ($checks as $check) {
            if ($check['level'] === 'fail') {
                $blocked = true;
                break;
            }
        }
        return ['blocked' => $blocked, 'checks' => $checks];
    }

    /**
     * @return list<array{id: string, level: string, title: string, detail: string, ask: string}>
     */
    public static function example(): array
    {
        return [
            self::row('php', 'fail', 'รุ่น PHP', 'เครื่องนี้เป็น PHP 8.1.29 แอปต้องการอย่างน้อย 8.2.36', 'ใน DirectAdmin เปิด Select PHP Version แล้วเลือก 8.3 หรือ 8.4'),
            self::row('ext', 'fail', 'ส่วนขยาย sodium', 'ยังไม่เปิด sodium แอปเข้ารหัสคีย์ AI ไม่ได้', 'ขอให้เปิดส่วนขยาย sodium, pdo_mysql, mbstring, intl, curl และ json'),
            self::row('memory', 'fail', 'memory_limit', 'ค่าตอนนี้คือ 64M การแฮชรหัสผ่านต้องใช้มากกว่านั้น', 'ขอ memory_limit อย่างน้อย 256M'),
            self::row('writable', 'fail', 'โฟลเดอร์ foundu', 'เขียน foundu/config ไม่ได้ จึงยังสร้างไฟล์ตั้งค่าไม่ได้', 'ใน File Manager ตั้งสิทธิ์ foundu/config และ foundu/storage ให้ผู้ใช้ของโดเมนเขียนได้'),
            self::row('upload_progress', 'fail', 'session.upload_progress', 'ยังเปิดอยู่ แอปจะไม่ยอมบูต', 'ตั้ง session.upload_progress.enabled = Off ใน Select PHP Version หรือใน .user.ini'),
        ];
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function phpVersion(): array
    {
        if (PHP_VERSION_ID < Platform::MIN_PHP_VERSION_ID) {
            return self::row(
                'php',
                'fail',
                'รุ่น PHP',
                'ตอนนี้เป็น ' . PHP_VERSION . ' ต่ำกว่า ' . Platform::MIN_PHP_VERSION,
                'ใน DirectAdmin เปิด Select PHP Version แล้วเลือก 8.3 หรือ 8.4'
            );
        }
        if (PHP_VERSION_ID < 80300) {
            $eol = Platform::eolWarning();
            $detail = 'PHP 8.2 หมดอายุวันที่ 31 ธันวาคม 2026';
            if (is_string($eol)) {
                $detail = $eol;
            }
            return self::row('php', 'warn', 'รุ่น PHP', 'ตอนนี้เป็น ' . PHP_VERSION . ' ' . $detail, 'เลือก 8.3 หรือ 8.4 ใน Select PHP Version ก่อนสิ้นปี 2026');
        }
        return self::row('php', 'ok', 'รุ่น PHP', 'ตอนนี้เป็น ' . PHP_VERSION, '');
    }

    /**
     * @return list<array{id: string, level: string, title: string, detail: string, ask: string}>
     */
    private static function extensions(): array
    {
        $required = [
            'pdo_mysql' => 'ต่อ MariaDB',
            'sodium' => 'เข้ารหัสคีย์',
            'mbstring' => 'ข้อความภาษาไทย',
            'intl' => 'รูปแบบข้อความ',
            'curl' => 'เรียกบริการภายนอก',
            'json' => 'อ่านข้อมูล',
        ];
        $rows = [];
        $missing = [];
        foreach ($required as $name => $why) {
            if (!extension_loaded($name)) {
                $missing[] = $name . ' (' . $why . ')';
            }
        }
        if ($missing !== []) {
            $rows[] = self::row('ext', 'fail', 'ส่วนขยายที่ต้องมี', 'ยังไม่มี ' . implode(', ', $missing), 'ขอให้เปิด pdo_mysql, sodium, mbstring, intl, curl และ json');
        } else {
            $rows[] = self::row('ext', 'ok', 'ส่วนขยายที่ต้องมี', 'pdo_mysql, sodium, mbstring, intl, curl, json พร้อมแล้ว', '');
        }
        $optional = [];
        if (!extension_loaded('gd')) {
            $optional[] = 'gd (รูปการ์ดแชร์บทความ จะใช้รูปสำรองแทน)';
        }
        if (!extension_loaded('apcu')) {
            $optional[] = 'apcu (ไม่มีก็ได้ แอปใช้ MariaDB นับจำนวนคำขอ)';
        }
        if ($optional === []) {
            $rows[] = self::row('ext_opt', 'ok', 'ส่วนขยายเสริม', 'gd และ apcu พร้อม', '');
        } else {
            $rows[] = self::row('ext_opt', 'warn', 'ส่วนขยายเสริม', implode(' ', $optional), 'ไม่มีก็ติดตั้งต่อได้ ถ้าต้องการรูปการ์ดแชร์ให้ขอ gd');
        }
        return $rows;
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function memory(): array
    {
        $raw = (string) ini_get('memory_limit');
        $bytes = self::iniBytes($raw);
        if ($bytes !== -1 && $bytes < 128 * 1024 * 1024) {
            return self::row('memory', 'fail', 'memory_limit', 'ค่าตอนนี้คือ ' . $raw . ' การแฮชรหัสผ่านใช้หน่วยความจำมากกว่านี้', 'ขอ memory_limit อย่างน้อย 256M');
        }
        if ($bytes !== -1 && $bytes < 256 * 1024 * 1024) {
            return self::row('memory', 'warn', 'memory_limit', 'ค่าตอนนี้คือ ' . $raw . ' อยากได้ 256M', 'ขอ memory_limit 256M ใน Select PHP Version หรือ .user.ini');
        }
        return self::row('memory', 'ok', 'memory_limit', 'ค่าตอนนี้คือ ' . $raw, '');
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function executionTime(): array
    {
        $raw = (string) ini_get('max_execution_time');
        $seconds = (int) $raw;
        if ($seconds === 0) {
            return self::row('time', 'ok', 'max_execution_time', 'ไม่จำกัดเวลาต่อคำขอ', '');
        }
        if ($seconds < 20) {
            return self::row('time', 'fail', 'max_execution_time', 'ค่าตอนนี้คือ ' . $seconds . ' วินาที สั้นเกินกว่าจะนำเข้าฐานข้อมูลเป็นช่วง', 'ขออย่างน้อย 30 วินาที');
        }
        if ($seconds < 30) {
            return self::row('time', 'warn', 'max_execution_time', 'ค่าตอนนี้คือ ' . $seconds . ' วินาที แอปออกแบบมาที่ 30', 'ขอ 30 วินาที cron และแชทจะได้ไม่ถูกตัดกลางทาง');
        }
        return self::row('time', 'ok', 'max_execution_time', 'ค่าตอนนี้คือ ' . $seconds . ' วินาที', '');
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function uploadSizes(): array
    {
        $post = (string) ini_get('post_max_size');
        $upload = (string) ini_get('upload_max_filesize');
        $postBytes = self::iniBytes($post);
        $uploadBytes = self::iniBytes($upload);
        $need = 8 * 1024 * 1024;
        $floor = 2 * 1024 * 1024;
        if (($postBytes !== -1 && $postBytes < $floor) || ($uploadBytes !== -1 && $uploadBytes < $floor)) {
            return self::row('upload', 'fail', 'ขนาดไฟล์ที่รับได้', 'post_max_size ' . $post . ', upload_max_filesize ' . $upload . ' รูปในแชทใหญ่กว่านี้', 'ขอทั้งสองค่าอย่างน้อย 8M');
        }
        if (($postBytes !== -1 && $postBytes < $need) || ($uploadBytes !== -1 && $uploadBytes < $need)) {
            return self::row('upload', 'warn', 'ขนาดไฟล์ที่รับได้', 'post_max_size ' . $post . ', upload_max_filesize ' . $upload . ' อยากได้ 8M', 'ขอทั้งสองค่าอย่างน้อย 8M');
        }
        return self::row('upload', 'ok', 'ขนาดไฟล์ที่รับได้', 'post_max_size ' . $post . ', upload_max_filesize ' . $upload, '');
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function uploadProgress(): array
    {
        if (Platform::uploadProgressEnabled()) {
            return self::row('upload_progress', 'fail', 'session.upload_progress', 'ยังเปิดอยู่ แอปจะตอบ 503 และไม่ยอมบูต', 'ตั้ง session.upload_progress.enabled = Off ใน Select PHP Version');
        }
        return self::row('upload_progress', 'ok', 'session.upload_progress', 'ปิดอยู่', '');
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function writable(string $appRoot): array
    {
        $paths = [
            $appRoot . '/config',
            $appRoot . '/storage',
            $appRoot . '/storage/cache',
            $appRoot . '/storage/logs',
        ];
        $bad = [];
        foreach ($paths as $path) {
            if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
                $bad[] = self::short($appRoot, $path) . ' (สร้างไม่ได้)';
                continue;
            }
            if (!is_writable($path)) {
                $bad[] = self::short($appRoot, $path);
            }
        }
        if ($bad !== []) {
            return self::row('writable', 'fail', 'โฟลเดอร์ foundu', 'เขียนไม่ได้: ' . implode(', ', $bad), 'ใน File Manager ตั้งสิทธิ์โฟลเดอร์เหล่านี้ให้ผู้ใช้ของโดเมนเขียนได้');
        }
        return self::row('writable', 'ok', 'โฟลเดอร์ foundu', 'config และ storage เขียนได้', '');
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function userIni(string $appRoot): array
    {
        $file = dirname($appRoot) . '/public_html/.user.ini';
        if (!is_file($file)) {
            return self::row('userini', 'warn', 'ไฟล์ .user.ini', 'ไม่พบ public_html/.user.ini', 'ตรวจว่าแตก zip แล้วได้ public_html คู่กับ foundu');
        }
        $text = (string) file_get_contents($file);
        $wanted = self::iniPair($text, 'memory_limit');
        $actual = (string) ini_get('memory_limit');
        $progress = self::iniPair($text, 'session.upload_progress.enabled');
        $progressOn = Platform::uploadProgressEnabled();
        if ($progress === '0' && $progressOn) {
            return self::row('userini', 'fail', 'ไฟล์ .user.ini', 'ไฟล์สั่งปิด upload progress แล้ว แต่ PHP ยังเปิดอยู่ โฮสต์ไม่ได้อ่านไฟล์นี้', 'ถามว่า php-fpm อ่าน .user.ini ใน public_html หรือไม่ และ user_ini.cache_ttl เป็นเท่าไร');
        }
        if ($wanted !== '' && strcasecmp($wanted, $actual) !== 0) {
            return self::row('userini', 'warn', 'ไฟล์ .user.ini', 'ไฟล์ขอ memory_limit ' . $wanted . ' แต่ PHP ใช้ ' . $actual, 'ถามว่าโฮสต์อ่าน .user.ini ใน public_html หรือไม่ ถ้าไม่ อ่านค่าใน Select PHP Version แทน');
        }
        return self::row('userini', 'ok', 'ไฟล์ .user.ini', 'ค่าที่ PHP ใช้อยู่ตรงกับไฟล์ (หรือยังไม่มีอะไรให้เทียบ)', '');
    }

    /**
     * @param callable(string): bool $probe
     * @return list<array{id: string, level: string, title: string, detail: string, ask: string}>
     */
    private static function outbound(callable $probe): array
    {
        $targets = [
            'turnstile' => ['https://challenges.cloudflare.com/turnstile/v0/siteverify', 'Turnstile'],
            'gemini' => ['https://generativelanguage.googleapis.com/', 'Gemini'],
            'openrouter' => ['https://openrouter.ai/', 'OpenRouter'],
            'r2' => ['https://r2.cloudflarestorage.com/', 'R2'],
        ];
        $rows = [];
        foreach ($targets as $id => $pair) {
            $ok = false;
            try {
                $ok = $probe($pair[0]) === true;
            } catch (\Throwable) {
                $ok = false;
            }
            if ($ok) {
                $rows[] = self::row('out_' . $id, 'ok', 'ออกเน็ตไป ' . $pair[1], 'เรียกถึง', '');
            } else {
                $rows[] = self::row(
                    'out_' . $id,
                    'warn',
                    'ออกเน็ตไป ' . $pair[1],
                    'เรียกไม่ถึงในช่วงเวลาสั้นๆ ติดตั้งต่อได้ แต่ฟีเจอร์นี้จะใช้ไม่ได้จนกว่าโฮสต์จะเปิดทาง',
                    'ถามว่าเซิร์ฟเวอร์เรียก HTTPS ออกไปที่ ' . $pair[0] . ' ได้ไหม'
                );
            }
        }
        return $rows;
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function cloudflare(string $appRoot, array $server): array
    {
        $remote = is_string($server['REMOTE_ADDR'] ?? null) ? $server['REMOTE_ADDR'] : '';
        $header = is_string($server['HTTP_CF_CONNECTING_IP'] ?? null) ? trim($server['HTTP_CF_CONNECTING_IP']) : '';
        $fromCloudflare = false;
        try {
            $client = ClientAddress::resolve($server, 'production', false, ClientAddress::ranges($appRoot));
            $fromCloudflare = $client->fromCloudflare;
        } catch (\Throwable) {
            return self::row('cf', 'warn', 'ไอพีที่ PHP เห็น', 'อ่านรายการไอพี Cloudflare ไม่ได้', 'ตรวจว่า foundu/config/cloudflare-ips.php ยังอยู่');
        }
        $off = is_file(dirname($appRoot) . '/public_html/.cf-allowlist-off');
        if ($fromCloudflare) {
            $extra = $off ? ' แต่มีไฟล์ .cf-allowlist-off ซึ่งปิดบล็อกนี้อยู่ อย่าอัปไฟล์นั้นขึ้นโฮสต์' : '';
            return self::row(
                'cf',
                $off ? 'warn' : 'ok',
                'ไอพีที่ PHP เห็น',
                'REMOTE_ADDR เป็นช่วงของ Cloudflare (' . $remote . ') บล็อก Require ip ใน .htaccess ใช้ได้ ให้คงไว้' . $extra,
                $off ? 'ลบ public_html/.cf-allowlist-off ก่อนเปิดจริง' : ''
            );
        }
        if ($header !== '') {
            return self::row(
                'cf',
                'warn',
                'ไอพีที่ PHP เห็น',
                'มีหัว CF-Connecting-IP แต่ REMOTE_ADDR เป็น ' . $remote . ' ซึ่งไม่ใช่ไอพีของ Cloudflare โฮสต์เขียนทับเป็นไอพีผู้เยี่ยมแล้ว บล็อก Require ip จะ 403 ทุกคน',
                'เอาบล็อก Require ip ระหว่างบรรทัด foundu-cloudflare-ips ออกจาก public_html/.htaccess ก่อนชี้โดเมนมาที่โฮสต์ อย่าไปเชื่อ X-Forwarded-For'
            );
        }
        $note = $off ? ' ไฟล์ .cf-allowlist-off ปิดบล็อกอยู่ ซึ่งถูกสำหรับเครื่องทดสอบ อย่าอัปขึ้นโฮสต์' : '';
        return self::row(
            'cf',
            'warn',
            'ไอพีที่ PHP เห็น',
            'ยังไม่เห็นว่าคำขอนี้มาจาก Cloudflare REMOTE_ADDR คือ ' . $remote . ' ถ้าจะวาง Cloudflare ไว้หน้าเว็บ ให้เปิดหน้านี้ซ้ำหลัง DNS สีส้ม แล้วอ่านผลอีกครั้ง' . $note,
            'ถาม VisperHost ว่า REMOTE_ADDR หลัง Cloudflare เป็นไอพีของ Cloudflare หรือถูกเขียนเป็นไอพีผู้เยี่ยม'
        );
    }

    /**
     * @return array{id: string, level: string, title: string, detail: string, ask: string}
     */
    private static function row(string $id, string $level, string $title, string $detail, string $ask): array
    {
        return ['id' => $id, 'level' => $level, 'title' => $title, 'detail' => $detail, 'ask' => $ask];
    }

    private static function iniBytes(string $raw): int
    {
        $raw = trim($raw);
        if ($raw === '' || $raw === '-1') {
            return -1;
        }
        $unit = strtolower(substr($raw, -1));
        $number = (int) $raw;
        return match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => (int) $raw,
        };
    }

    private static function iniPair(string $text, string $key): string
    {
        $pattern = '/^\s*' . preg_quote($key, '/') . '\s*=\s*(.+)$/mi';
        if (preg_match($pattern, $text, $match) !== 1) {
            return '';
        }
        return trim($match[1], " \t\"'");
    }

    private static function short(string $appRoot, string $path): string
    {
        $prefix = $appRoot . '/';
        if (strncmp($path, $prefix, strlen($prefix)) === 0) {
            return 'foundu/' . substr($path, strlen($prefix));
        }
        return $path;
    }
}
