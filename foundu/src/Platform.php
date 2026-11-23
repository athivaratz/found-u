<?php

namespace Foundu;

// Parsed on purpose with old syntax. api/index.php loads this file before
// Composer so a too-old PHP gets JSON instead of a parse error.
final class Platform
{
    const MIN_PHP_VERSION_ID = 80236;
    const MIN_PHP_VERSION = '8.2.36';
    const MIN_MARIADB_10 = '10.11.20';
    const MIN_MARIADB_11 = '11.4.14';

    public static function bootError()
    {
        if (PHP_VERSION_ID < self::MIN_PHP_VERSION_ID) {
            return array(
                'ok' => false,
                'error' => 'php_version',
                'php' => PHP_VERSION,
                'min_php' => self::MIN_PHP_VERSION,
            );
        }
        if (self::uploadProgressEnabled()) {
            return array(
                'ok' => false,
                'error' => 'upload_progress',
            );
        }
        return null;
    }

    public static function uploadProgressEnabled()
    {
        $value = ini_get('session.upload_progress.enabled');
        if ($value === false || $value === '' || $value === '0') {
            return false;
        }
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    // 10.11.20+ on the 10.11 line, or 11.4.14 and newer. 10.6 is rejected.
    public static function acceptsMariaDb($version)
    {
        if (!is_string($version) || !preg_match('/^(\d+\.\d+\.\d+)/', $version, $match)) {
            return false;
        }
        $found = $match[1];
        if (version_compare($found, '11.0.0', '>=')) {
            return version_compare($found, self::MIN_MARIADB_11, '>=');
        }
        if (version_compare($found, '10.11.0', '>=') && version_compare($found, '10.12.0', '<')) {
            return version_compare($found, self::MIN_MARIADB_10, '>=');
        }
        return false;
    }
}
