<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Ai\SecretBox;
use Foundu\Search\Rank;
use Foundu\Search\Trigram;
use PHPUnit\Framework\TestCase;

final class SearchRelevanceTest extends TestCase
{
    public function testPostgresTrigramVectors(): void
    {
        $grams = array_keys(Trigram::set('cat'));
        sort($grams);
        $this->assertSame(['  c', ' ca', 'at ', 'cat'], $grams);
        $this->assertEqualsWithDelta(1.0, Trigram::similarity('cat', 'cat'), 1e-9);
        $this->assertEqualsWithDelta(0.5, Trigram::similarity('cat', 'cats'), 1e-9);
        $this->assertEqualsWithDelta(1 / 3, Trigram::similarity('cat', 'car'), 1e-9);
    }

    public function testTopFiveOverlapAgainstPgTrgmFixture(): void
    {
        $fixture = json_decode((string) file_get_contents(__DIR__ . '/fixtures/search-expected.json'), true, 32, JSON_THROW_ON_ERROR);
        $rows = $fixture['items'];
        $threshold = (float) $fixture['threshold'];
        $limit = (int) $fixture['limit'];
        $scores = [];
        foreach ($fixture['queries'] as $query) {
            $actual = Rank::top($rows, (string) $query['q'], $threshold, $limit);
            $expected = $query['expected'];
            $this->assertSame($expected, $actual, (string) $query['q']);
            $denom = max(1, count($expected));
            $scores[] = count(array_intersect($actual, $expected)) / $denom;
        }
        $this->assertCount(20, $scores);
        $mean = array_sum($scores) / count($scores);
        $this->assertGreaterThanOrEqual(0.8, $mean, 'top-5 overlap ' . $mean);
        $this->assertEqualsWithDelta(1.0, $mean, 1e-9);
    }

    public function testSecretBoxRoundTripDoesNotStorePlaintext(): void
    {
        $plain = 'AIza-test-key-not-real-0001';
        $key = SecretBox::key(['APP_KEY' => 'unit-test-app-key-32-bytes-minimum!!']);
        $box = SecretBox::seal($plain, $key);
        $this->assertSame(24, strlen($box['nonce']));
        $this->assertFalse(str_contains($box['cipher'], $plain));
        $this->assertSame($plain, SecretBox::open($box['cipher'], $box['nonce'], $key));
        $this->assertNull(SecretBox::open($box['cipher'], $box['nonce'], SecretBox::key(['APP_KEY' => 'another-app-key-32-bytes-minimum!'])));
    }
}
