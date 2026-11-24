<?php

declare(strict_types=1);

namespace Foundu\Search;

// Postgres pg_trgm, the part MariaDB 10.11 does not have.
// A trigram is three characters. The string is padded with two spaces on
// the left and one on the right, duplicates are dropped, and similarity
// is the Jaccard of the two sets. "cat" is {"  c"," ca","cat","at "}.
// Thai has no spaces, so the grams are characters, not words. FULLTEXT on
// this server splits on spaces and would treat a whole Thai phrase as one
// token, which does not rank a partial name.
final class Trigram
{
    public static function set(string $value): array
    {
        $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
        if ($chars === false) {
            return [];
        }
        $padded = array_merge([' ', ' '], $chars, [' ']);
        $grams = [];
        $last = count($padded) - 3;
        for ($i = 0; $i <= $last; $i++) {
            $grams[$padded[$i] . $padded[$i + 1] . $padded[$i + 2]] = true;
        }
        return $grams;
    }

    public static function similarity(string $left, string $right): float
    {
        $a = self::set($left);
        $b = self::set($right);
        if ($a === [] || $b === []) {
            return 0.0;
        }
        $shared = 0;
        foreach ($a as $gram => $_) {
            if (isset($b[$gram])) {
                $shared++;
            }
        }
        $union = count($a) + count($b) - $shared;
        if ($union <= 0) {
            return 0.0;
        }
        return $shared / $union;
    }
}
