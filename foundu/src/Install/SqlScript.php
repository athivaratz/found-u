<?php

declare(strict_types=1);

namespace Foundu\Install;

// The same split migrate.php uses. Strings and comments stay intact, and
// a DELIMITER change is not sent to the server. One piece is one PDO exec,
// because the host has no exec() and the PDO handle refuses multi-statements.
final class SqlScript
{
    /**
     * @return list<string>
     */
    public static function split(string $sql): array
    {
        $len = strlen($sql);
        $i = 0;
        $delimiter = ';';
        $buf = '';
        $state = 'code';
        $out = [];

        $flush = static function () use (&$buf, &$out): void {
            $stmt = trim($buf);
            $buf = '';
            if ($stmt === '' || self::codeIsEmpty($stmt)) {
                return;
            }
            $out[] = $stmt;
        };

        while ($i < $len) {
            $c = $sql[$i];
            $n = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($state === 'line') {
                $buf .= $c;
                $i++;
                if ($c === "\n") {
                    $state = 'code';
                }
                continue;
            }

            if ($state === 'block') {
                if ($c === '*' && $n === '/') {
                    $buf .= '*/';
                    $i += 2;
                    $state = 'code';
                    continue;
                }
                $buf .= $c;
                $i++;
                continue;
            }

            if ($state === 'sq') {
                if ($c === '\\' && $n !== '') {
                    $buf .= $c . $n;
                    $i += 2;
                    continue;
                }
                if ($c === "'" && $n === "'") {
                    $buf .= "''";
                    $i += 2;
                    continue;
                }
                $buf .= $c;
                $i++;
                if ($c === "'") {
                    $state = 'code';
                }
                continue;
            }

            if ($state === 'dq') {
                if ($c === '\\' && $n !== '') {
                    $buf .= $c . $n;
                    $i += 2;
                    continue;
                }
                if ($c === '"' && $n === '"') {
                    $buf .= '""';
                    $i += 2;
                    continue;
                }
                $buf .= $c;
                $i++;
                if ($c === '"') {
                    $state = 'code';
                }
                continue;
            }

            if ($c === "'") {
                $state = 'sq';
                $buf .= $c;
                $i++;
                continue;
            }
            if ($c === '"') {
                $state = 'dq';
                $buf .= $c;
                $i++;
                continue;
            }
            if ($c === '#') {
                $state = 'line';
                $buf .= $c;
                $i++;
                continue;
            }
            if ($c === '-' && $n === '-') {
                $state = 'line';
                $buf .= $c;
                $i++;
                continue;
            }
            if ($c === '/' && $n === '*') {
                $state = 'block';
                $buf .= '/*';
                $i += 2;
                continue;
            }

            if (self::codeIsEmpty($buf) && ($c === 'D' || $c === 'd')) {
                if (preg_match('/\Gdelimiter\s+(\S+)/i', $sql, $match, 0, $i) === 1) {
                    $delimiter = $match[1];
                    $i += strlen($match[0]);
                    while ($i < $len && $sql[$i] !== "\n") {
                        $i++;
                    }
                    if ($i < $len && $sql[$i] === "\n") {
                        $i++;
                    }
                    continue;
                }
            }

            $dlen = strlen($delimiter);
            if ($dlen > 0 && substr($sql, $i, $dlen) === $delimiter) {
                $flush();
                $i += $dlen;
                continue;
            }

            $buf .= $c;
            $i++;
        }

        $flush();
        return $out;
    }

    public static function codeIsEmpty(string $buf): bool
    {
        $stripped = preg_replace('/\/\*.*?\*\//s', '', $buf) ?? $buf;
        $stripped = preg_replace('/--[^\n]*(\n|$)/', "\n", $stripped) ?? $stripped;
        $stripped = preg_replace('/#[^\n]*(\n|$)/', "\n", $stripped) ?? $stripped;
        return trim($stripped) === '';
    }
}
