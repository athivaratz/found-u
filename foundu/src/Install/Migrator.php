<?php

declare(strict_types=1);

namespace Foundu\Install;

use PDO;
use RuntimeException;
use Throwable;

// Applies foundu/migrations/[0-9]*.sql in slices that stop before the host's
// 30 second limit. Progress is a file index, not the SQL, and a finished
// file is recorded in schema_migrations the same way bin/migrate.php does.
final class Migrator
{
    /**
     * @return list<string> absolute paths, sorted
     */
    public static function files(string $dir): array
    {
        $found = glob(rtrim($dir, '/') . '/[0-9]*.sql');
        if ($found === false) {
            return [];
        }
        sort($found, SORT_STRING);
        return array_values($found);
    }

    /**
     * @return list<string> filenames still to run
     */
    public static function pending(PDO $pdo, string $dir): array
    {
        $applied = self::applied($pdo);
        $pending = [];
        foreach (self::files($dir) as $path) {
            $name = basename($path);
            $sql = self::read($path);
            $checksum = hash('sha256', $sql);
            if (isset($applied[$name])) {
                if (!hash_equals($applied[$name], $checksum)) {
                    throw new RuntimeException($name . ' changed after it was applied');
                }
                continue;
            }
            $pending[] = $name;
        }
        return $pending;
    }

    /**
     * @return array{done: bool, ran: int, file: string, pending: list<string>}
     */
    public static function advance(PDO $pdo, string $dir, string $progressPath, int $deadline, int $maxStatements): array
    {
        $files = self::files($dir);
        $applied = self::applied($pdo);
        $progress = self::progress($progressPath);
        $ran = 0;
        $current = '';

        foreach ($files as $path) {
            $name = basename($path);
            $sql = self::read($path);
            $checksum = hash('sha256', $sql);
            if (isset($applied[$name])) {
                if (!hash_equals($applied[$name], $checksum)) {
                    throw new RuntimeException($name . ' changed after it was applied');
                }
                continue;
            }
            $current = $name;
            $parts = SqlScript::split($sql);
            foreach ($parts as $index => $statement) {
                if (preg_match('/\bBEGIN\b/i', $statement) === 1 && preg_match('/\bEND\b/i', $statement) !== 1) {
                    throw new RuntimeException($name . ' was split in the middle of a trigger');
                }
            }
            $start = 0;
            $storedSum = (string) ($progress['checksum'] ?? '');
            if (($progress['file'] ?? '') === $name && strlen($storedSum) === strlen($checksum) && hash_equals($storedSum, $checksum)) {
                $start = max(0, (int) ($progress['stmt'] ?? 0));
            }
            $count = count($parts);
            for ($i = $start; $i < $count; $i++) {
                if (time() >= $deadline || ($maxStatements > 0 && $ran >= $maxStatements)) {
                    self::saveProgress($progressPath, $name, $checksum, $i);
                    return [
                        'done' => false,
                        'ran' => $ran,
                        'file' => $name,
                        'pending' => self::pending($pdo, $dir),
                    ];
                }
                try {
                    $pdo->exec($parts[$i]);
                } catch (Throwable $e) {
                    self::saveProgress($progressPath, $name, $checksum, $i);
                    $detail = preg_replace('/\s+/', ' ', $e->getMessage()) ?? '';
                    if (strlen($detail) > 180) {
                        $detail = substr($detail, 0, 180);
                    }
                    throw new RuntimeException($name . ' statement ' . ($i + 1) . ' failed: ' . $detail, 0, $e);
                }
                $ran++;
                self::saveProgress($progressPath, $name, $checksum, $i + 1);
            }
            $insert = $pdo->prepare('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)');
            $insert->execute([$name, $checksum]);
            $applied[$name] = $checksum;
            self::saveProgress($progressPath, '', '', 0);
        }

        if (is_file($progressPath)) {
            @unlink($progressPath);
        }
        return [
            'done' => true,
            'ran' => $ran,
            'file' => $current,
            'pending' => [],
        ];
    }

    /**
     * @return array<string, string>
     */
    private static function applied(PDO $pdo): array
    {
        try {
            $rows = $pdo->query('SELECT filename, checksum FROM schema_migrations')->fetchAll();
        } catch (Throwable) {
            return [];
        }
        $applied = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $applied[(string) $row['filename']] = (string) $row['checksum'];
            }
        }
        return $applied;
    }

    private static function read(string $path): string
    {
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException('could not read ' . basename($path));
        }
        return $sql;
    }

    /**
     * @return array{file?: string, checksum?: string, stmt?: int}
     */
    private static function progress(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function saveProgress(string $path, string $file, string $checksum, int $stmt): void
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('could not store import progress');
        }
        $json = json_encode(['file' => $file, 'checksum' => $checksum, 'stmt' => $stmt], JSON_THROW_ON_ERROR);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new RuntimeException('could not store import progress');
        }
        @chmod($path, 0600);
    }
}
