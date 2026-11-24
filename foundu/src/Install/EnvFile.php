<?php

declare(strict_types=1);

namespace Foundu\Install;

// Writes config/.env.php and checks the mode is 600. A mode the host ignores
// is a failure: the file is removed so a secret is not left world-readable.
final class EnvFile
{
    /**
     * @param array<string, string> $values
     * @return array{ok: bool, perms: int, error: string}
     */
    public static function write(string $path, array $values): array
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return ['ok' => false, 'perms' => 0, 'error' => 'dir'];
        }
        if (!is_writable($dir)) {
            return ['ok' => false, 'perms' => 0, 'error' => 'dir'];
        }
        $export = var_export($values, true);
        $php = <<<PHP
<?php

declare(strict_types=1);

// Written by the installer. Keep this file at mode 600.
// Do not send it in a chat or commit it.

return {$export};

PHP;
        $tmp = $path . '.writing';
        if (file_put_contents($tmp, $php, LOCK_EX) === false) {
            @unlink($tmp);
            return ['ok' => false, 'perms' => 0, 'error' => 'write'];
        }
        @chmod($tmp, 0600);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return ['ok' => false, 'perms' => 0, 'error' => 'write'];
        }
        @chmod($path, 0600);
        clearstatcache(true, $path);
        $perms = fileperms($path);
        $mode = is_int($perms) ? ($perms & 0777) : 0;
        if ($mode !== 0600) {
            @unlink($path);
            return ['ok' => false, 'perms' => $mode, 'error' => 'perms'];
        }
        return ['ok' => true, 'perms' => $mode, 'error' => ''];
    }

    public static function mode(string $path): int
    {
        clearstatcache(true, $path);
        $perms = fileperms($path);
        return is_int($perms) ? ($perms & 0777) : 0;
    }
}
