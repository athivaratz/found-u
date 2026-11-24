<?php

declare(strict_types=1);

namespace Foundu\Install;

// File counter for the installer. The database may not exist yet, and the
// file stores a hash of the address, not the address, the token, or a password.
final class Attempts
{
    public const WINDOW = 900;
    public const MAX_FAILS = 8;
    public const MAX_POSTS = 120;

    /**
     * @return array{blocked: bool, retry: int}
     */
    public static function charge(string $path, string $ip, int $now, bool $isPost, bool $failed): array
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return ['blocked' => false, 'retry' => 0];
        }
        $fh = fopen($path, 'c+');
        if ($fh === false) {
            return ['blocked' => false, 'retry' => 0];
        }
        try {
            if (!flock($fh, LOCK_EX)) {
                return ['blocked' => false, 'retry' => 0];
            }
            $raw = stream_get_contents($fh);
            $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
            if (!is_array($data)) {
                $data = [];
            }
            $salt = $data['salt'] ?? '';
            if (!is_string($salt) || strlen($salt) < 16) {
                $salt = bin2hex(random_bytes(16));
            }
            $rows = is_array($data['rows'] ?? null) ? $data['rows'] : [];
            $fresh = [];
            foreach ($rows as $key => $row) {
                if (!is_string($key) || !is_array($row)) {
                    continue;
                }
                $start = (int) ($row['start'] ?? 0);
                if ($now - $start >= self::WINDOW) {
                    continue;
                }
                $fresh[$key] = [
                    'start' => $start,
                    'fails' => (int) ($row['fails'] ?? 0),
                    'posts' => (int) ($row['posts'] ?? 0),
                ];
            }
            $id = hash('sha256', $salt . '|' . $ip);
            $row = $fresh[$id] ?? ['start' => $now, 'fails' => 0, 'posts' => 0];
            if ($now - (int) $row['start'] >= self::WINDOW) {
                $row = ['start' => $now, 'fails' => 0, 'posts' => 0];
            }
            $blocked = $row['fails'] >= self::MAX_FAILS || ($isPost && $row['posts'] >= self::MAX_POSTS);
            if (!$blocked) {
                if ($isPost) {
                    $row['posts']++;
                }
                if ($failed) {
                    $row['fails']++;
                }
                $fresh[$id] = $row;
            }
            $payload = json_encode(['salt' => $salt, 'rows' => $fresh], JSON_THROW_ON_ERROR);
            rewind($fh);
            ftruncate($fh, 0);
            fwrite($fh, $payload);
            fflush($fh);
            $retry = max(1, self::WINDOW - ($now - (int) $row['start']));
            return ['blocked' => $blocked, 'retry' => $retry];
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
