<?php

declare(strict_types=1);

namespace Foundu\Match;

// Word and character-bigram similarity from lib/ner.ts calculateSimilarity.
// Matching uses this. Catalog search uses Search\Trigram (pg_trgm, n=3).
// They are not the same score and must not be mixed.
final class Text
{
    public static function normalize(string $text): string
    {
        $lower = mb_strtolower($text, 'UTF-8');
        $collapsed = preg_replace('/\s+/u', ' ', $lower);
        return trim(is_string($collapsed) ? $collapsed : $lower);
    }

    public static function similarity(string $left, string $right): float
    {
        if ($left === '' || $right === '') {
            return 0.0;
        }
        $a = self::normalize($left);
        $b = self::normalize($right);
        if ($a === '' || $b === '') {
            return 0.0;
        }
        if ($a === $b) {
            return 1.0;
        }
        if (str_contains($a, $b) || str_contains($b, $a)) {
            $shorter = mb_strlen($a, 'UTF-8') < mb_strlen($b, 'UTF-8') ? $a : $b;
            $longer = $shorter === $a ? $b : $a;
            $longLen = mb_strlen($longer, 'UTF-8');
            if ($longLen === 0) {
                return 0.0;
            }
            return 0.7 + (0.3 * mb_strlen($shorter, 'UTF-8') / $longLen);
        }
        $ng = self::jaccard(self::ngrams($a, 2), self::ngrams($b, 2));
        $wordsA = self::words($a);
        $wordsB = self::words($b);
        $common = 0;
        foreach ($wordsA as $word) {
            foreach ($wordsB as $other) {
                if (str_contains($other, $word) || str_contains($word, $other)) {
                    $common++;
                    break;
                }
            }
        }
        $wordScore = ($wordsA !== [] || $wordsB !== [])
            ? ($common * 2) / (count($wordsA) + count($wordsB))
            : 0.0;
        return max($ng * 0.6 + $wordScore * 0.4, $ng, $wordScore);
    }

    private static function words(string $text): array
    {
        $parts = preg_split('/ /u', $text) ?: [];
        $words = [];
        foreach ($parts as $part) {
            if ($part !== '') {
                $words[] = $part;
            }
        }
        return $words;
    }

    private static function ngrams(string $text, int $n): array
    {
        $grams = [];
        $len = mb_strlen($text, 'UTF-8');
        for ($i = 0; $i <= $len - $n; $i++) {
            $grams[mb_substr($text, $i, $n, 'UTF-8')] = true;
        }
        return $grams;
    }

    private static function jaccard(array $a, array $b): float
    {
        if ($a === [] && $b === []) {
            return 0.0;
        }
        $shared = 0;
        foreach ($a as $gram => $_) {
            if (isset($b[$gram])) {
                $shared++;
            }
        }
        $union = count($a) + count($b) - $shared;
        return $union === 0 ? 0.0 : $shared / $union;
    }
}
