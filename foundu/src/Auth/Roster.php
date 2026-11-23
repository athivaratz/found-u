<?php

declare(strict_types=1);

namespace Foundu\Auth;

// The same colon-separated roster the admin page already exports.
// Legacy rows carry a school password. Roster rows do not.
final class Roster
{
    public static function parse(string $content): array
    {
        $lines = preg_split('/\r\n|\n|\r/', $content) ?: [];
        $rows = [];
        $errors = [];
        $lineNumber = 0;
        foreach ($lines as $raw) {
            $lineNumber++;
            $line = trim($raw);
            if ($line === '' || str_starts_with($line, '#') || str_starts_with(strtolower($line), 'studentid')) {
                continue;
            }
            $parts = array_map(static fn (string $part): string => trim($part), explode(':', $line));
            if (count($parts) < 2) {
                $errors[] = ['line' => $lineNumber, 'message' => 'รูปแบบไม่ถูกต้อง ต้องมีอย่างน้อย เลขประจำตัว:ชื่อ'];
                continue;
            }
            $studentId = self::digits($parts[0]);
            if (preg_match('/^\d{5}$/', $studentId) !== 1) {
                $errors[] = ['line' => $lineNumber, 'message' => 'เลขประจำตัวไม่ถูกต้อง: ' . $parts[0]];
                continue;
            }
            if (count($parts) >= 5 && preg_match('/^[A-Za-z0-9]{7,8}$/', $parts[1]) === 1) {
                $first = $parts[2];
                $last = $parts[3];
                if ($first === '' || $last === '') {
                    $errors[] = ['line' => $lineNumber, 'message' => 'ต้องมีชื่อและนามสกุล'];
                    continue;
                }
                $rows[] = [
                    'studentId' => $studentId,
                    'password' => $parts[1],
                    'firstName' => $first,
                    'lastName' => $last,
                    'nickname' => $parts[4] !== '' ? $parts[4] : $first,
                    'gradeLevel' => null,
                    'roomNumber' => null,
                    'format' => 'legacy',
                    'lineNumber' => $lineNumber,
                ];
                continue;
            }
            $parsed = self::names($parts);
            if ($parsed === null) {
                $errors[] = [
                    'line' => $lineNumber,
                    'message' => 'รูปแบบไม่ถูกต้อง รองรับ 2-4 คอลัมน์ (หรือ 5 คอลัมน์แบบ legacy พร้อมรหัสผ่าน)',
                ];
                continue;
            }
            if ($parsed['firstName'] === '') {
                $errors[] = ['line' => $lineNumber, 'message' => 'ต้องมีชื่อ'];
                continue;
            }
            $rows[] = [
                'studentId' => $studentId,
                'password' => null,
                'firstName' => $parsed['firstName'],
                'lastName' => $parsed['lastName'],
                'nickname' => $parsed['firstName'],
                'gradeLevel' => $parsed['gradeLevel'],
                'roomNumber' => $parsed['roomNumber'],
                'format' => 'roster',
                'lineNumber' => $lineNumber,
            ];
        }
        return ['rows' => $rows, 'errors' => $errors];
    }

    private static function names(array $parts): ?array
    {
        $count = count($parts);
        $grade = null;
        $room = null;
        $first = '';
        $last = '';
        if ($count === 4) {
            $class = self::classField($parts[1]);
            $grade = $class['gradeLevel'];
            $room = $class['roomNumber'];
            $first = $parts[2];
            $last = $parts[3];
        } elseif ($count === 3) {
            if (self::isClass($parts[1])) {
                $class = self::classField($parts[1]);
                $grade = $class['gradeLevel'];
                $room = $class['roomNumber'];
                $split = self::splitName($parts[2]);
                $first = $split['firstName'];
                $last = $split['lastName'];
            } else {
                $first = $parts[1];
                $last = $parts[2];
            }
        } elseif ($count === 2) {
            $split = self::splitName($parts[1]);
            $first = $split['firstName'];
            $last = $split['lastName'];
        } else {
            return null;
        }
        return [
            'firstName' => $first,
            'lastName' => $last,
            'gradeLevel' => $grade,
            'roomNumber' => $room,
        ];
    }

    private static function isClass(string $value): bool
    {
        if ($value === '') {
            return false;
        }
        return preg_match('/^[มปด]\./u', $value) === 1
            || preg_match('/^\d{1,2}$/', $value) === 1
            || preg_match('/^[มปด]\.\d+\/\d+$/u', $value) === 1;
    }

    private static function classField(string $value): array
    {
        if (preg_match('/^([มปด]\.\d+)\/(\d+)$/u', $value, $match) === 1) {
            return ['gradeLevel' => $match[1], 'roomNumber' => $match[2]];
        }
        if (preg_match('/^[มปด]\./u', $value) === 1) {
            return ['gradeLevel' => $value, 'roomNumber' => null];
        }
        if (preg_match('/^\d{1,2}$/', $value) === 1) {
            return ['gradeLevel' => null, 'roomNumber' => $value];
        }
        return ['gradeLevel' => $value !== '' ? $value : null, 'roomNumber' => null];
    }

    private static function splitName(string $full): array
    {
        $full = trim($full);
        $at = mb_strrpos($full, ' ');
        if ($at === false || $at === 0) {
            return ['firstName' => $full, 'lastName' => ''];
        }
        return [
            'firstName' => trim(mb_substr($full, 0, $at)),
            'lastName' => trim(mb_substr($full, $at + 1)),
        ];
    }

    private static function digits(string $raw): string
    {
        $digits = preg_replace('/\D/', '', $raw) ?? '';
        if ($digits === '') {
            return '';
        }
        return substr(str_pad($digits, 5, '0', STR_PAD_LEFT), -5);
    }
}
