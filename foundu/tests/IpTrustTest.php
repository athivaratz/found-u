<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Http\ClientAddress;
use Foundu\Platform;
use PHPUnit\Framework\TestCase;

final class IpTrustTest extends TestCase
{
    private array $ranges;

    protected function setUp(): void
    {
        $this->ranges = ClientAddress::ranges(dirname(__DIR__));
    }

    public function testCloudflarePeerUsesConnectingIp(): void
    {
        $client = ClientAddress::resolve([
            'REMOTE_ADDR' => '173.245.48.10',
            'HTTP_CF_CONNECTING_IP' => '203.0.113.9',
            'HTTP_CF_IPCOUNTRY' => 'th',
            'HTTP_X_FORWARDED_FOR' => '198.51.100.8',
        ], 'production', false, $this->ranges);

        $this->assertSame('203.0.113.9', $client->ip);
        $this->assertSame('TH', $client->country);
        $this->assertTrue($client->fromCloudflare);
        $this->assertNotSame('198.51.100.8', $client->ip);
    }

    public function testForwardedForIsIgnoredEvenFromCloudflare(): void
    {
        $client = ClientAddress::resolve([
            'REMOTE_ADDR' => '173.245.48.10',
            'HTTP_X_FORWARDED_FOR' => '198.51.100.8',
        ], 'production', false, $this->ranges);

        $this->assertSame('173.245.48.10', $client->ip);
    }

    public function testStrangerCannotSupplyConnectingIp(): void
    {
        $client = ClientAddress::resolve([
            'REMOTE_ADDR' => '203.0.113.50',
            'HTTP_CF_CONNECTING_IP' => '198.51.100.7',
            'HTTP_X_FORWARDED_FOR' => '198.51.100.8',
        ], 'local', true, $this->ranges);

        $this->assertSame('203.0.113.50', $client->ip);
        $this->assertFalse($client->fromCloudflare);
    }

    public function testMockHeadersNeedTheLocalFlag(): void
    {
        $off = ClientAddress::resolve([
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_X_MOCK_CF_EDGE_IP' => '173.245.48.10',
            'HTTP_X_MOCK_CF_CONNECTING_IP' => '203.0.113.9',
        ], 'local', false, $this->ranges);
        $this->assertSame('127.0.0.1', $off->ip);

        $on = ClientAddress::resolve([
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_X_MOCK_CF_EDGE_IP' => '173.245.48.10',
            'HTTP_X_MOCK_CF_CONNECTING_IP' => '203.0.113.9',
            'HTTP_X_MOCK_CF_IPCOUNTRY' => 'th',
        ], 'local', true, $this->ranges);
        $this->assertSame('203.0.113.9', $on->ip);
        $this->assertTrue($on->mock);
    }

    public function testPhp82EolWarningStartsTheNextDay(): void
    {
        $this->assertNull(Platform::eolWarning('2026-12-31'));
        if (PHP_VERSION_ID >= 80300) {
            $this->assertNull(Platform::eolWarning('2027-01-01'));
        } else {
            $this->assertIsString(Platform::eolWarning('2027-01-01'));
        }
    }
}
