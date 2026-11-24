<?php

declare(strict_types=1);

namespace Foundu\Install;

use Foundu\Auth\BootstrapAdmin;
use Foundu\Auth\PasswordHash;
use Foundu\Database;
use PDO;
use Throwable;

// The five steps of /install. The session holds the database password until
// the env file is written, then drops it. The response never prints a secret.
final class Front
{
    public static $probe = null;

    public static function run(string $appRoot): void
    {
        $early = self::lockedResponse($appRoot);
        if ($early !== null) {
            self::emit($early);
            return;
        }
        $dir = $appRoot . '/storage/install-sessions';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
            @chmod($dir, 0700);
        }
        $https = self::https($_SERVER);
        session_name('foundu_setup');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/install',
            'domain' => '',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
        $bag = new Bag($_SESSION);
        $result = self::handle($appRoot, $bag, $_POST, $_GET, $_SERVER);
        if (!empty($result['rotate'])) {
            session_regenerate_id(true);
        }
        if (!empty($result['destroy'])) {
            $_SESSION = [];
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_destroy();
            }
            self::clearSessions($appRoot);
        }
        self::emit($result);
    }

    /**
     * @param array<string, mixed> $post
     * @param array<string, mixed> $query
     * @param array<string, mixed> $server
     * @return array{status: int, headers: array<string, string>, body: string, rotate?: bool, destroy?: bool}
     */
    public static function handle(string $appRoot, Bag $bag, array $post, array $query, array $server, ?int $now = null): array
    {
        $now ??= time();
        $locked = self::lockedResponse($appRoot);
        if ($locked !== null) {
            return $locked;
        }
        $ip = is_string($server['REMOTE_ADDR'] ?? null) ? $server['REMOTE_ADDR'] : '0';
        $attemptFile = $appRoot . '/storage/install-attempts.json';
        $gate = Attempts::charge($attemptFile, $ip, $now, false, false);
        if ($gate['blocked']) {
            return self::plain(429, "ลองใหม่ภายหลัง\n", ['Retry-After' => (string) $gate['retry']]);
        }

        self::freshCsrf($bag);
        self::expire($bag, $now);

        $method = is_string($server['REQUEST_METHOD'] ?? null) ? $server['REQUEST_METHOD'] : 'GET';
        $notice = '';
        $failed = false;
        if ($method === 'POST') {
            $sent = is_string($post['csrf'] ?? null) ? $post['csrf'] : '';
            $have = (string) $bag->get('csrf', '');
            if ($have === '' || strlen($sent) !== strlen($have) || !hash_equals($have, $sent)) {
                $failed = true;
                $notice = 'คำขอหมดอายุ โหลดหน้านี้ใหม่แล้วลองอีกครั้ง';
            } elseif ($bag->get('authed') !== true && (string) ($post['step'] ?? '') !== 'token') {
                $failed = true;
                $notice = 'ใส่โทเค็นก่อน';
            } else {
                $failed = !self::act($appRoot, $bag, $post, $server, $now, $notice);
            }
            $again = Attempts::charge($attemptFile, $ip, $now, true, $failed);
            if ($again['blocked']) {
                return self::plain(429, "ลองใหม่ภายหลัง\n", ['Retry-After' => (string) $again['retry']]);
            }
        }
        if ($notice !== '') {
            $bag->set('notice', $notice);
        }
        $rotate = $bag->get('rotate') === true;
        $destroy = $bag->get('destroy') === true;
        $bag->set('rotate', false);
        $screen = self::screen($appRoot, $bag, $query, $server);
        $screen['rotate'] = $rotate;
        $screen['destroy'] = $destroy;
        return $screen;
    }

    /**
     * @param array<string, mixed> $post
     * @param array<string, mixed> $server
     */
    private static function act(string $appRoot, Bag $bag, array $post, array $server, int $now, string &$notice): bool
    {
        $step = is_string($post['step'] ?? null) ? $post['step'] : '';
        if ($step === 'token') {
            $given = is_string($post['token'] ?? null) ? $post['token'] : '';
            if (!Token::matches($appRoot, $given)) {
                $notice = 'โทเค็นไม่ตรง เปิดไฟล์ foundu/install-token.txt ใน File Manager แล้วคัดลอกทั้งบรรทัด';
                return false;
            }
            $bag->set('authed', true);
            $bag->set('created_at', $now);
            $bag->set('csrf', bin2hex(random_bytes(16)));
            $bag->set('rotate', true);
            $bag->forget('preflight_cache');
            return true;
        }
        if ($bag->get('authed') !== true) {
            $notice = 'ใส่โทเค็นก่อน';
            return false;
        }
        if ($step === 'recheck') {
            $bag->forget('preflight_cache');
            $bag->set('preflight_ok', false);
            return true;
        }
        if ($step === 'preflight') {
            $report = self::report($appRoot, $bag, $server, true);
            if ($report['blocked']) {
                $notice = 'ยังมีข้อที่ต้องแก้ก่อน ดูรายการสีแดง';
                return false;
            }
            $bag->set('preflight_ok', true);
            return true;
        }
        if ($step === 'db') {
            return self::saveDb($appRoot, $bag, $post, $now, $notice);
        }
        if ($step === 'import') {
            return self::importMore($appRoot, $bag, $now, $notice);
        }
        if ($step === 'config') {
            return self::saveConfig($appRoot, $bag, $post, $notice);
        }
        if ($step === 'admin') {
            return self::saveAdmin($appRoot, $bag, $post, $notice);
        }
        if ($step === 'finish') {
            return self::finish($appRoot, $bag, $now, $notice);
        }
        $notice = 'ขั้นนี้ไม่รู้จัก';
        return false;
    }

    /**
     * @param array<string, mixed> $query
     * @param array<string, mixed> $server
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    private static function screen(string $appRoot, Bag $bag, array $query, array $server): array
    {
        $notice = $bag->get('notice');
        $bag->set('notice', '');
        $flash = is_string($notice) ? $notice : '';
        $view = is_string($query['view'] ?? null) ? $query['view'] : '';
        if ($bag->get('authed') !== true) {
            return self::html(self::tokenForm($bag, $flash), 'token');
        }
        if ($view === 'example') {
            return self::html(self::exampleForm($bag), 'check');
        }
        if ($bag->get('preflight_ok') !== true) {
            $report = self::report($appRoot, $bag, $server, false);
            return self::html(self::preflightForm($bag, $report, $flash), 'check');
        }
        if ($bag->get('import_done') !== true) {
            $db = $bag->get('db');
            if (!is_array($db) || (string) ($db['pass'] ?? '') === '') {
                return self::html(self::dbForm($bag, $flash), 'db');
            }
            return self::html(self::importForm($bag, $flash), 'db');
        }
        if ($bag->get('config_done') !== true) {
            return self::html(self::configForm($bag, $flash), 'config');
        }
        if ($bag->get('admin_done') !== true) {
            return self::html(self::adminForm($bag, $flash), 'admin');
        }
        return self::html(self::doneForm($bag, $flash), 'done');
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function saveDb(string $appRoot, Bag $bag, array $post, int $now, string &$notice): bool
    {
        $host = self::field($post, 'db_host');
        $name = self::field($post, 'db_name');
        $user = self::field($post, 'db_user');
        $pass = is_string($post['db_pass'] ?? null) ? $post['db_pass'] : '';
        $port = self::field($post, 'db_port');
        if ($port === '') {
            $port = '3306';
        }
        if (preg_match('/^[A-Za-z0-9.-]{1,253}$/', $host) !== 1) {
            $notice = 'โฮสต์ฐานข้อมูลใช้ได้แค่ตัวอักษร จุด และขีด';
            return false;
        }
        if (preg_match('/^\d{1,5}$/', $port) !== 1 || (int) $port < 1 || (int) $port > 65535) {
            $notice = 'พอร์ตไม่ถูกต้อง';
            return false;
        }
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $name) !== 1 || preg_match('/^[A-Za-z0-9._-]{1,64}$/', $user) !== 1) {
            $notice = 'ชื่อฐานข้อมูลและชื่อผู้ใช้ใช้ตัวอักษร ตัวเลข และขีดล่าง';
            return false;
        }
        if ($pass === '' || strlen($pass) > 128 || str_contains($pass, "\0")) {
            $notice = 'ใส่รหัสผ่านฐานข้อมูล';
            return false;
        }
        try {
            $pdo = Database::connect([
                'DB_HOST' => $host,
                'DB_PORT' => $port,
                'DB_NAME' => $name,
                'DB_USER' => $user,
                'DB_PASS' => $pass,
            ]);
            $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        } catch (Throwable) {
            $notice = 'ต่อฐานข้อมูลไม่ได้ ตรวจโฮสต์ ชื่อฐาน ชื่อผู้ใช้ และรหัสผ่าน ถ้าโฮสต์เป็นเครื่องนี้ ลอง localhost';
            return false;
        }
        $bag->set('db', [
            'host' => $host,
            'port' => $port,
            'name' => $name,
            'user' => $user,
            'pass' => $pass,
        ]);
        $bag->set('db_note', self::dbNote($version));
        return self::advance($appRoot, $bag, $pdo, $now, $notice);
    }

    private static function importMore(string $appRoot, Bag $bag, int $now, string &$notice): bool
    {
        $db = $bag->get('db');
        if (!is_array($db) || (string) ($db['pass'] ?? '') === '') {
            $notice = 'ใส่ข้อมูลฐานข้อมูลอีกครั้ง';
            return false;
        }
        try {
            $pdo = Database::connect([
                'DB_HOST' => (string) $db['host'],
                'DB_PORT' => (string) $db['port'],
                'DB_NAME' => (string) $db['name'],
                'DB_USER' => (string) $db['user'],
                'DB_PASS' => (string) $db['pass'],
            ]);
        } catch (Throwable) {
            $bag->set('db', null);
            $notice = 'ต่อฐานข้อมูลไม่ได้แล้ว ใส่รหัสผ่านอีกครั้ง';
            return false;
        }
        return self::advance($appRoot, $bag, $pdo, $now, $notice);
    }

    private static function advance(string $appRoot, Bag $bag, PDO $pdo, int $now, string &$notice): bool
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(25);
        }
        try {
            $result = Migrator::advance(
                $pdo,
                $appRoot . '/migrations',
                $appRoot . '/storage/install-import.json',
                $now + 18,
                0
            );
        } catch (Throwable) {
            $notice = 'นำเข้าไม่สำเร็จในช่วงนี้ กดทำต่อได้ ถ้าซ้ำอีกให้ดูว่าฐานว่างและผู้ใช้มีสิทธิ์สร้างตาราง';
            return false;
        }
        $bag->set('import_status', [
            'file' => $result['file'],
            'pending' => count($result['pending']),
            'done' => $result['done'],
        ]);
        if ($result['done']) {
            $bag->set('import_done', true);
        }
        return true;
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function saveConfig(string $appRoot, Bag $bag, array $post, string &$notice): bool
    {
        $path = Lock::envPath($appRoot);
        if (is_file($path)) {
            $mode = EnvFile::mode($path);
            if ($mode !== 0600) {
                $notice = 'มีไฟล์ตั้งค่าอยู่แล้ว แต่สิทธิ์ไม่ใช่ 600 ใน File Manager ตั้งเป็น 600 แล้วกดขั้นนี้อีกครั้ง ตัวติดตั้งจะไม่เขียนทับ';
                return false;
            }
            $bag->set('config_done', true);
            $notice = 'ใช้ไฟล์ตั้งค่าที่มีอยู่แล้ว ไม่ได้เขียนทับ';
            return true;
        }
        $db = $bag->get('db');
        if (!is_array($db) || (string) ($db['pass'] ?? '') === '') {
            $notice = 'ข้อมูลฐานข้อมูลหายจากเซสชัน กลับไปขั้นฐานข้อมูล';
            $bag->set('import_done', false);
            return false;
        }
        $url = self::field($post, 'app_url');
        $parts = parse_url($url);
        $scheme = is_array($parts) ? (string) ($parts['scheme'] ?? '') : '';
        $host = is_array($parts) ? (string) ($parts['host'] ?? '') : '';
        if (($scheme !== 'https' && $scheme !== 'http') || $host === '') {
            $notice = 'APP_URL ต้องขึ้นต้นด้วย https:// และเป็นโดเมนจริง';
            return false;
        }
        $local = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
        if ($scheme !== 'https' && !$local) {
            $notice = 'APP_URL ของเว็บจริงต้องเป็น https';
            return false;
        }
        $r2Account = self::field($post, 'r2_account');
        $r2Key = self::field($post, 'r2_key');
        $r2Secret = self::field($post, 'r2_secret');
        $r2Bucket = self::field($post, 'r2_bucket');
        $r2Public = self::field($post, 'r2_public');
        $siteKey = self::field($post, 'turnstile_site');
        $siteSecret = self::field($post, 'turnstile_secret');
        $r2Any = ($r2Account . $r2Key . $r2Secret . $r2Bucket . $r2Public) !== '';
        $r2Core = $r2Account !== '' && $r2Key !== '' && $r2Secret !== '' && $r2Bucket !== '';
        if ($r2Any && !$r2Core) {
            $notice = 'ถ้าจะใส่ R2 ต้องมีบัญชี คีย์ คีย์ลับ และชื่อบัคเก็ตครบ';
            return false;
        }
        if ($r2Public !== '' && preg_match('#^https://#', $r2Public) !== 1) {
            $notice = 'ที่อยู่รูปสาธารณะของ R2 ต้องขึ้นต้นด้วย https://';
            return false;
        }
        $turnstileBoth = $siteKey !== '' && $siteSecret !== '';
        $turnstileAny = $siteKey !== '' || $siteSecret !== '';
        if ($turnstileAny && !$turnstileBoth) {
            $notice = 'คีย์ Turnstile ต้องมีทั้ง site key และ secret';
            return false;
        }
        $later = (string) ($post['fill_later'] ?? '') === '1';
        if ((!$r2Core || !$turnstileBoth) && !$later) {
            $notice = 'ถ้ายังไม่มี R2 หรือ Turnstile ให้ติ๊กช่องว่าจะใส่ทีหลัง';
            return false;
        }
        foreach ([$r2Account, $r2Key, $r2Secret, $r2Bucket, $siteKey, $siteSecret, self::field($post, 'gemini'), self::field($post, 'openrouter')] as $secret) {
            if (strlen($secret) > 512 || str_contains($secret, "\0")) {
                $notice = 'ค่าที่วางยาวเกินหรือมีตัวอักขระที่ใช้ไม่ได้';
                return false;
            }
        }
        $skipAi = (string) ($post['skip_ai'] ?? '') === '1';
        $domain = self::field($post, 'school_domain');
        if ($domain === '') {
            $domain = $host;
        }
        if (preg_match('/^[A-Za-z0-9.-]+$/', $domain) !== 1) {
            $notice = 'โดเมนโรงเรียนใช้ตัวอักษร จุด และขีด';
            return false;
        }
        $appKey = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $values = self::defaults();
        $values['APP_ENV'] = $scheme === 'https' ? 'production' : 'local';
        $values['APP_URL'] = $url;
        $values['APP_KEY'] = $appKey;
        $values['DB_HOST'] = (string) $db['host'];
        $values['DB_PORT'] = (string) $db['port'];
        $values['DB_NAME'] = (string) $db['name'];
        $values['DB_USER'] = (string) $db['user'];
        $values['DB_PASS'] = (string) $db['pass'];
        $values['SCHOOL_AUTH_DOMAIN'] = $domain;
        $values['R2_ACCOUNT_ID'] = $r2Account;
        $values['R2_ACCESS_KEY_ID'] = $r2Key;
        $values['R2_SECRET_ACCESS_KEY'] = $r2Secret;
        $values['R2_BUCKET_NAME'] = $r2Bucket;
        $values['R2_PUBLIC_BASE_URL'] = $r2Public;
        $values['GEMINI_API_KEY'] = $skipAi ? '' : self::field($post, 'gemini');
        $values['OPENROUTER_API_KEY'] = $skipAi ? '' : self::field($post, 'openrouter');
        $values['OPENROUTER_MODEL'] = $skipAi ? '' : self::field($post, 'openrouter_model');
        $values['TURNSTILE_SITE_KEY'] = $siteKey;
        $values['TURNSTILE_SECRET'] = $siteSecret;
        $values['TURNSTILE_ENABLED'] = $turnstileBoth ? '1' : '0';
        $written = EnvFile::write($path, $values);
        if (!$written['ok']) {
            if ($written['error'] === 'perms') {
                $notice = 'เขียนไฟล์ได้แต่ตั้งสิทธิ์ 600 ไม่ได้ ไฟล์ถูกลบแล้ว ถามโฮสต์ว่า chmod ใช้ได้ไหม แล้วตั้ง foundu/config ให้ผู้ใช้ของโดเมนเป็นเจ้าของ';
            } else {
                $notice = 'เขียน foundu/config/.env.php ไม่ได้ ตรวจว่าโฟลเดอร์ config เขียนได้';
            }
            return false;
        }
        $bag->set('config_done', true);
        return true;
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function saveAdmin(string $appRoot, Bag $bag, array $post, string &$notice): bool
    {
        $db = $bag->get('db');
        $studentId = self::field($post, 'student_id');
        $password = is_string($post['password'] ?? null) ? $post['password'] : '';
        $confirm = is_string($post['password_confirm'] ?? null) ? $post['password_confirm'] : '';
        if (preg_match('/^\d{5}$/', $studentId) !== 1) {
            $notice = 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก';
            return false;
        }
        if (strlen($password) !== strlen($confirm) || !hash_equals($password, $confirm)) {
            $notice = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
            return false;
        }
        $problem = BootstrapAdmin::passwordError($password, $studentId, true);
        if ($problem !== null) {
            $notice = self::passwordNotice($problem);
            return false;
        }
        $first = BootstrapAdmin::name(self::field($post, 'first_name'), 'Admin');
        $last = BootstrapAdmin::name(self::field($post, 'last_name'), 'Found-U');
        $nickname = BootstrapAdmin::name(self::field($post, 'nickname'), 'Admin');
        if ($first === '' || $last === '' || $nickname === '') {
            $notice = 'ชื่อยาวเกิน 100 ตัว';
            return false;
        }
        if (!is_array($db) || (string) ($db['pass'] ?? '') === '') {
            $notice = 'ข้อมูลฐานข้อมูลหายจากเซสชัน';
            return false;
        }
        try {
            $hash = BootstrapAdmin::hash($password);
            if (PasswordHash::isBcrypt($hash) && strlen($password) > 72) {
                $notice = self::passwordNotice('bcrypt');
                return false;
            }
            $pdo = Database::connect([
                'DB_HOST' => (string) ($db['host'] ?? ''),
                'DB_PORT' => (string) ($db['port'] ?? '3306'),
                'DB_NAME' => (string) ($db['name'] ?? ''),
                'DB_USER' => (string) ($db['user'] ?? ''),
                'DB_PASS' => (string) ($db['pass'] ?? ''),
            ]);
            $email = $studentId . '@students.' . self::schoolDomain($appRoot);
            $written = BootstrapAdmin::apply($pdo, [
                'id' => BootstrapAdmin::newId(),
                'studentId' => $studentId,
                'email' => $email,
                'display' => trim($first . ' ' . $last),
                'first' => $first,
                'last' => $last,
                'nickname' => $nickname,
                'hash' => $hash,
            ]);
        } catch (Throwable) {
            $notice = 'สร้างผู้ดูแลไม่ได้ ตรวจว่านำเข้าตารางครบแล้ว';
            return false;
        }
        if ($written < 1) {
            $notice = 'มีบัญชีรหัสนี้อยู่แล้ว ใช้รหัสอื่น';
            return false;
        }
        self::dropSecret($bag);
        $bag->set('admin_done', true);
        $bag->set('admin_id', $studentId);
        return true;
    }

    private static function finish(string $appRoot, Bag $bag, int $now, string &$notice): bool
    {
        if ($bag->get('admin_done') !== true || !is_file(Lock::envPath($appRoot))) {
            $notice = 'ยังสร้างผู้ดูแลหรือไฟล์ตั้งค่าไม่ครบ';
            return false;
        }
        if (!Lock::write($appRoot, $now)) {
            $notice = 'เขียนไฟล์ล็อกไม่ได้ ตรวจสิทธิ์ foundu/config';
            return false;
        }
        self::disable($appRoot);
        self::dropSecret($bag);
        $bag->set('destroy', true);
        $bag->set('finished', true);
        return true;
    }

    public static function disable(string $appRoot): void
    {
        $index = dirname($appRoot) . '/public_html/install/index.php';
        if (is_file($index) && is_writable($index) && !@unlink($index)) {
            $stub = "<?php\nhttp_response_code(404);\nheader('Content-Type: text/plain; charset=utf-8');\nheader('Cache-Control: private, no-store');\nheader('X-Robots-Tag: noindex');\necho \"Not Found\\n\";\n";
            file_put_contents($index, $stub, LOCK_EX);
        }
        foreach ([
            Lock::tokenPath($appRoot),
            $appRoot . '/storage/install-import.json',
            $appRoot . '/storage/install-attempts.json',
        ] as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    /**
     * @param array<string, mixed> $server
     * @return array{blocked: bool, checks: list<array{id: string, level: string, title: string, detail: string, ask: string}>}
     */
    private static function report(string $appRoot, Bag $bag, array $server, bool $force): array
    {
        $cached = $bag->get('preflight_cache');
        if (!$force && is_array($cached) && (int) ($cached['at'] ?? 0) > time() - 600 && is_array($cached['report'] ?? null)) {
            return $cached['report'];
        }
        $probe = self::$probe;
        $report = Preflight::collect($appRoot, $server, is_callable($probe) ? $probe : null);
        $bag->set('preflight_cache', ['at' => time(), 'report' => $report]);
        return $report;
    }

    private static function dbNote(string $version): string
    {
        if ($version === '') {
            return 'อ่านรุ่นฐานข้อมูลไม่ได้';
        }
        if (stripos($version, 'MariaDB') === false) {
            return 'รุ่นที่ตอบมาคือ ' . $version . ' แอปทดสอบกับ MariaDB 10.11 ถ้าเป็น MySQL ให้ถามโฮสต์ว่ามี MariaDB 10.11 หรือใหม่กว่าไหม';
        }
        if (preg_match('/(\d+\.\d+\.\d+)/', $version, $match) === 1 && version_compare($match[1], '10.11.0', '<')) {
            return 'MariaDB ' . $match[1] . ' เก่ากว่า 10.11 แอปไม่รองรับสาย 10.6 ขอ 10.11 หรือใหม่กว่า';
        }
        return 'ต่อได้ รุ่น ' . $version;
    }

    private static function schoolDomain(string $appRoot): string
    {
        $path = Lock::envPath($appRoot);
        if (!is_file($path)) {
            return 'local';
        }
        $loaded = require $path;
        $domain = is_array($loaded) ? trim((string) ($loaded['SCHOOL_AUTH_DOMAIN'] ?? '')) : '';
        if ($domain === '' || preg_match('/^[A-Za-z0-9.-]+$/', $domain) !== 1) {
            return 'local';
        }
        return $domain;
    }

    private static function dropSecret(Bag $bag): void
    {
        $db = $bag->get('db');
        if (!is_array($db)) {
            return;
        }
        $db['pass'] = '';
        $bag->set('db', $db);
    }

    private static function passwordNotice(string $code): string
    {
        return match ($code) {
            'long' => 'รหัสผ่านยาวเกิน 128 ตัว',
            'bcrypt' => 'เครื่องนี้ใช้ bcrypt ซึ่งไม่ดูตัวอักษรหลังตัวที่ 72 ให้สั้นลง',
            'common' => 'รหัสผ่านนี้เดาง่าย เลือกใหม่',
            'same' => 'อย่าใช้รหัสนักเรียนเป็นรหัสผ่าน',
            default => 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข',
        };
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function field(array $post, string $key): string
    {
        $value = $post[$key] ?? '';
        if (!is_string($value)) {
            return '';
        }
        return trim(str_replace(["\r", "\n", "\0"], '', $value));
    }

    private static function freshCsrf(Bag $bag): void
    {
        $have = $bag->get('csrf');
        if (!is_string($have) || strlen($have) < 32) {
            $bag->set('csrf', bin2hex(random_bytes(16)));
        }
    }

    private static function expire(Bag $bag, int $now): void
    {
        $created = (int) $bag->get('created_at', 0);
        if ($created > 0 && $now - $created > 7200) {
            $csrf = bin2hex(random_bytes(16));
            $bag->set('authed', false);
            $bag->set('db', null);
            $bag->set('preflight_ok', false);
            $bag->set('import_done', false);
            $bag->set('config_done', false);
            $bag->set('admin_done', false);
            $bag->set('csrf', $csrf);
            $bag->set('created_at', 0);
            $bag->set('notice', 'เซสชันหมดอายุ ใส่โทเค็นอีกครั้ง');
        }
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}|null
     */
    private static function lockedResponse(string $appRoot): ?array
    {
        if (!Lock::engaged($appRoot)) {
            return null;
        }
        return self::plain(404, "Not Found\n");
    }

    /**
     * @param array<string, string> $extra
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    private static function plain(int $status, string $body, array $extra = []): array
    {
        $headers = [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Cache-Control' => 'private, no-store',
            'CDN-Cache-Control' => 'no-store',
            'X-Robots-Tag' => 'noindex',
        ];
        foreach ($extra as $name => $value) {
            $headers[$name] = $value;
        }
        return ['status' => $status, 'headers' => $headers, 'body' => $body];
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    private static function html(string $inner, string $step): array
    {
        $body = self::layout($inner, $step);
        return [
            'status' => 200,
            'headers' => [
                'Content-Type' => 'text/html; charset=utf-8',
                'Cache-Control' => 'private, no-store',
                'CDN-Cache-Control' => 'no-store',
                'X-Robots-Tag' => 'noindex',
                'X-Content-Type-Options' => 'nosniff',
                'Referrer-Policy' => 'no-referrer',
            ],
            'body' => $body,
        ];
    }

    private static function layout(string $inner, string $step): string
    {
        $steps = [
            'token' => 'โทเค็น',
            'check' => 'ตรวจเครื่อง',
            'db' => 'ฐานข้อมูล',
            'config' => 'ค่าตั้ง',
            'admin' => 'ผู้ดูแล',
            'done' => 'เสร็จ',
        ];
        $nav = '';
        foreach ($steps as $id => $label) {
            $class = $id === $step ? ' class="on"' : '';
            $nav .= '<li' . $class . '>' . self::e($label) . '</li>';
        }
        return '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<meta name="robots" content="noindex">'
            . '<title>ติดตั้ง Found-U</title>'
            . '<link rel="stylesheet" href="/install/install.css">'
            . '</head><body><main><p class="brand">Found-U</p><h1>ติดตั้งเว็บ</h1>'
            . '<ol class="steps">' . $nav . '</ol>' . $inner
            . '</main><script src="/install/install.js"></script></body></html>';
    }

    private static function tokenForm(Bag $bag, string $flash): string
    {
        return self::flash($flash) . '<p>เปิด File Manager ไปที่โฟลเดอร์ <strong>foundu</strong> ซึ่งอยู่ข้าง public_html ไม่ใช่ข้างใน เปิดไฟล์ <strong>install-token.txt</strong> แล้ววางทั้งบรรทัดด้านล่าง</p>'
            . '<form method="post" action="/install/">'
            . self::csrf($bag)
            . '<input type="hidden" name="step" value="token">'
            . '<label>โทเค็นตั้งค่า<input name="token" autocomplete="off" spellcheck="false" required></label>'
            . '<button type="submit">ต่อไป</button></form>';
    }

    /**
     * @param array{blocked: bool, checks: list<array{id: string, level: string, title: string, detail: string, ask: string}>} $report
     */
    private static function preflightForm(Bag $bag, array $report, string $flash): string
    {
        $html = self::flash($flash) . '<p>ขั้นนี้ดูว่าเครื่องโฮสต์พร้อมรันแอปหรือยัง ข้อสีแดงต้องแก้ก่อน ข้อสีเหลืองไปต่อได้</p>'
            . self::checks($report['checks'])
            . '<p><a href="/install?view=example">ดูตัวอย่างเมื่อตรวจไม่ผ่าน</a></p>'
            . '<form method="post" action="/install/">' . self::csrf($bag);
        if ($report['blocked']) {
            $html .= '<input type="hidden" name="step" value="recheck"><button type="submit">ตรวจใหม่</button>';
        } else {
            $html .= '<input type="hidden" name="step" value="preflight"><button type="submit">ใช้เครื่องนี้ต่อ</button>';
        }
        return $html . '</form>';
    }

    private static function exampleForm(Bag $bag): string
    {
        return '<p class="warn">นี่คือตัวอย่าง ไม่ใช่ผลของเครื่องนี้</p>'
            . self::checks(Preflight::example())
            . '<form method="post" action="/install/">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="recheck"><button type="submit">กลับไปตรวจเครื่องนี้</button></form>';
    }

    private static function dbForm(Bag $bag, string $flash): string
    {
        $db = $bag->get('db');
        $host = is_array($db) ? (string) ($db['host'] ?? 'localhost') : 'localhost';
        $port = is_array($db) ? (string) ($db['port'] ?? '3306') : '3306';
        $name = is_array($db) ? (string) ($db['name'] ?? '') : '';
        $user = is_array($db) ? (string) ($db['user'] ?? '') : '';
        return self::flash($flash) . '<p>สร้างฐานใน DirectAdmin ก่อน แล้วใส่ชื่อที่ได้จากแผง รหัสผ่านจะไม่ถูกแสดงซ้ำ</p>'
            . '<form method="post" action="/install/">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="db">'
            . '<label>โฮสต์<input name="db_host" value="' . self::e($host) . '" required></label>'
            . '<label>พอร์ต<input name="db_port" value="' . self::e($port) . '" inputmode="numeric" required></label>'
            . '<label>ชื่อฐาน<input name="db_name" value="' . self::e($name) . '" required></label>'
            . '<label>ผู้ใช้<input name="db_user" value="' . self::e($user) . '" required></label>'
            . '<label>รหัสผ่าน<input name="db_pass" type="password" autocomplete="new-password" required></label>'
            . '<button type="submit">ทดสอบแล้วเริ่มนำเข้า</button></form>';
    }

    private static function importForm(Bag $bag, string $flash): string
    {
        $status = $bag->get('import_status');
        $file = is_array($status) ? (string) ($status['file'] ?? '') : '';
        $pending = is_array($status) ? (int) ($status['pending'] ?? 0) : 0;
        $note = is_string($bag->get('db_note')) ? (string) $bag->get('db_note') : '';
        $html = self::flash($flash);
        if ($note !== '') {
            $html .= '<p>' . self::e($note) . '</p>';
        }
        $html .= '<p>กำลังนำเข้าทีละช่วง เพื่อไม่ให้เกิน 30 วินาที ถ้าหน้านี้ค้าง ให้กดทำต่อ</p>';
        if ($file !== '') {
            $html .= '<p>ล่าสุดถึง <strong>' . self::e($file) . '</strong> ยังเหลือ ' . $pending . ' ไฟล์</p>';
        }
        return $html . '<form method="post" action="/install/" data-continue="1">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="import"><button type="submit">ทำต่อ</button></form>';
    }

    private static function configForm(Bag $bag, string $flash): string
    {
        return self::flash($flash) . '<p>คีย์เซสชันและคีย์ libsodium จะถูกสุ่มบนเซิร์ฟเวอร์ หน้านี้ไม่แสดงค่าเต็ม ไฟล์จะถูกตั้งสิทธิ์ 600</p>'
            . '<form method="post" action="/install/">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="config">'
            . '<label>ที่อยู่เว็บ (APP_URL)<input name="app_url" placeholder="https://example.com" required></label>'
            . '<label>โดเมนโรงเรียน เว้นได้<input name="school_domain" placeholder="school.ac.th"></label>'
            . '<fieldset><legend>R2</legend>'
            . '<label>Account ID<input name="r2_account" autocomplete="off"></label>'
            . '<label>Access key<input name="r2_key" autocomplete="off"></label>'
            . '<label>Secret<input name="r2_secret" type="password" autocomplete="new-password"></label>'
            . '<label>ชื่อบัคเก็ต<input name="r2_bucket" autocomplete="off"></label>'
            . '<label>ที่อยู่รูปสาธารณะ<input name="r2_public" placeholder="https://"></label>'
            . '</fieldset><fieldset><legend>Turnstile</legend>'
            . '<label>Site key<input name="turnstile_site" autocomplete="off"></label>'
            . '<label>Secret<input name="turnstile_secret" type="password" autocomplete="new-password"></label>'
            . '</fieldset><fieldset><legend>AI ใส่หรือข้ามก็ได้</legend>'
            . '<label>Gemini<input name="gemini" type="password" autocomplete="new-password"></label>'
            . '<label>OpenRouter<input name="openrouter" type="password" autocomplete="new-password"></label>'
            . '<label>โมเดล OpenRouter<input name="openrouter_model" autocomplete="off"></label>'
            . '<label class="check"><input type="checkbox" name="skip_ai" value="1"> ยังไม่ใส่คีย์ AI</label>'
            . '</fieldset>'
            . '<label class="check"><input type="checkbox" name="fill_later" value="1"> ยังไม่มี R2 หรือ Turnstile จะใส่ในไฟล์ตั้งค่าทีหลัง</label>'
            . '<button type="submit">บันทึกค่าตั้ง</button></form>';
    }

    private static function adminForm(Bag $bag, string $flash): string
    {
        return self::flash($flash) . '<p>บัญชีแรกเป็นผู้ดูแล ใช้ล็อกอินหลังติดตั้ง รหัสผ่านต้องมีตัวอักษรและตัวเลข อย่างน้อย 8 ตัว</p>'
            . '<form method="post" action="/install/">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="admin">'
            . '<label>รหัสนักเรียน 5 หลัก<input name="student_id" inputmode="numeric" minlength="5" maxlength="5" required></label>'
            . '<label>ชื่อ<input name="first_name"></label>'
            . '<label>นามสกุล<input name="last_name"></label>'
            . '<label>ชื่อที่แสดง<input name="nickname"></label>'
            . '<label>รหัสผ่าน<input name="password" type="password" autocomplete="new-password" required></label>'
            . '<label>รหัสผ่านอีกครั้ง<input name="password_confirm" type="password" autocomplete="new-password" required></label>'
            . '<button type="submit">สร้างผู้ดูแล</button></form>';
    }

    private static function doneForm(Bag $bag, string $flash): string
    {
        if ($bag->get('finished') === true || $bag->get('destroy') === true) {
            $cron = '*/5 * * * * php ~/foundu/bin/cron.php';
            $who = is_string($bag->get('admin_id')) ? (string) $bag->get('admin_id') : '';
            return self::flash($flash) . '<p>ติดตั้งแล้ว หน้านี้เปิดซ้ำไม่ได้ จะขึ้นว่าไม่พบหน้า คัดลอกคำสั่ง cron ก่อนปิด</p>'
                . '<p>ใน DirectAdmin เปิด Cron Jobs แล้ววางบรรทัดนี้ ทุก 5 นาที ถ้าแผงบอกพาธ PHP ให้ใช้พาธเต็มของ 8.3 หรือ 8.4 แทนคำว่า php</p>'
                . '<pre>' . self::e($cron) . '</pre>'
                . '<p><a href="/cloudflare-checklist.html">รายการตรวจ Cloudflare</a></p>'
                . '<p>จากนั้นล้างแคช Cloudflare แล้วลองล็อกอิน'
                . ($who !== '' ? ' ด้วยรหัสนักเรียน ' . self::e($who) : '')
                . '</p>';
        }
        return self::flash($flash) . '<p>พร้อมปิดหน้าติดตั้ง หลังกดปุ่มนี้ โทเค็นจะถูกลบ และเปิด /install อีกครั้งจะได้ 404</p>'
            . '<form method="post" action="/install/">' . self::csrf($bag)
            . '<input type="hidden" name="step" value="finish"><button type="submit">เสร็จสิ้นและปิดหน้าติดตั้ง</button></form>';
    }

    /**
     * @param list<array{id: string, level: string, title: string, detail: string, ask: string}> $checks
     */
    private static function checks(array $checks): string
    {
        $html = '<ul class="checks">';
        foreach ($checks as $check) {
            $level = $check['level'] === 'fail' || $check['level'] === 'warn' ? $check['level'] : 'ok';
            $html .= '<li class="' . $level . '"><strong>' . self::e($check['title']) . '</strong><p>'
                . self::e($check['detail']) . '</p>';
            if ($check['ask'] !== '') {
                $html .= '<p class="ask">ถามโฮสต์: ' . self::e($check['ask']) . '</p>';
            }
            $html .= '</li>';
        }
        return $html . '</ul>';
    }

    private static function flash(string $text): string
    {
        if ($text === '') {
            return '';
        }
        return '<p class="flash" role="alert">' . self::e($text) . '</p>';
    }

    private static function csrf(Bag $bag): string
    {
        return '<input type="hidden" name="csrf" value="' . self::e((string) $bag->get('csrf', '')) . '">';
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * @return array<string, string>
     */
    private static function defaults(): array
    {
        return [
            'APP_ENV' => 'production',
            'APP_URL' => '',
            'APP_KEY' => '',
            'DB_HOST' => 'localhost',
            'DB_PORT' => '3306',
            'DB_NAME' => '',
            'DB_USER' => '',
            'DB_PASS' => '',
            'SCHOOL_AUTH_DOMAIN' => '',
            'R2_ACCOUNT_ID' => '',
            'R2_ACCESS_KEY_ID' => '',
            'R2_SECRET_ACCESS_KEY' => '',
            'R2_BUCKET_NAME' => '',
            'R2_PUBLIC_BASE_URL' => '',
            'R2_ENDPOINT' => '',
            'R2_REGION' => '',
            'GEMINI_API_KEY' => '',
            'OPENROUTER_API_KEY' => '',
            'OPENROUTER_MODEL' => '',
            'TURNSTILE_SITE_KEY' => '',
            'TURNSTILE_SECRET' => '',
            'TURNSTILE_ENABLED' => '0',
            'AI_MAX_CONCURRENCY' => '3',
            'AI_SLOT_LEASE_SECONDS' => '60',
            'AI_QUOTA_PER_MINUTE' => '5',
            'AI_QUOTA_PER_HOUR' => '30',
            'AI_SYSTEM_QUOTA_PER_MINUTE' => '20',
            'AI_SYSTEM_QUOTA_PER_HOUR' => '100',
            'RATE_LIMIT_API_PER_MINUTE' => '120',
            'RATE_LIMIT_AUTH_PER_MINUTE' => '10',
            'RATE_LIMIT_PRESIGN_PER_HOUR' => '20',
            'SESSION_IDLE_SECONDS' => '1800',
            'SESSION_ABSOLUTE_SECONDS' => '43200',
            'BODY_MAX_BYTES' => '262144',
            'BODY_MAX_AI_BYTES' => '65536',
            'LOGIN_LOCK_ACCOUNT_LIMIT' => '5',
            'LOGIN_LOCK_ACCOUNT_SECONDS' => '900',
            'LOGIN_LOCK_IP_LIMIT' => '20',
            'LOGIN_LOCK_IP_SECONDS' => '3600',
            'SEARCH_SIMILARITY_THRESHOLD' => '0.15',
            'AGENT_SEARCH_SIMILARITY_THRESHOLD' => '0.30',
            'AGENT_WALL_SECONDS' => '25',
            'AGENT_SSE' => '0',
            'GEOCODE_USER_AGENT' => 'Found-U (school lost-and-found)',
            'GEOCODE_ENDPOINT' => '',
            'GEOCODE_API_KEY' => '',
            'SIGNUPS_ENABLED' => '1',
        ];
    }

    /**
     * @param array<string, mixed> $server
     */
    private static function https(array $server): bool
    {
        $flag = $server['HTTPS'] ?? '';
        if (is_string($flag) && $flag !== '' && $flag !== 'off') {
            return true;
        }
        return (string) ($server['SERVER_PORT'] ?? '') === '443';
    }

    /**
     * @param array{status: int, headers: array<string, string>, body: string} $result
     */
    private static function emit(array $result): void
    {
        http_response_code($result['status']);
        foreach ($result['headers'] as $name => $value) {
            header($name . ': ' . $value);
        }
        echo $result['body'];
    }

    private static function clearSessions(string $appRoot): void
    {
        $dir = $appRoot . '/storage/install-sessions';
        if (!is_dir($dir)) {
            return;
        }
        $list = scandir($dir);
        if ($list === false) {
            return;
        }
        foreach ($list as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $path = $dir . '/' . $name;
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }
}
