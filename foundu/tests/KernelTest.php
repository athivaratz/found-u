<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Kernel;
use Slim\Psr7\Factory\ServerRequestFactory;

final class KernelTest extends DbTestCase
{
    public function testUnknownRouteIsJsonAndAuthIsLimited(): void
    {
        $app = Kernel::create(dirname(__DIR__));
        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest('GET', 'http://localhost/api/no-such', [
            'REMOTE_ADDR' => '203.0.113.80',
            'REQUEST_URI' => '/api/no-such',
        ]);
        $response = $app->handle($request);
        $body = json_decode((string) $response->getBody(), true);
        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame('not_found', $body['error']);
        $this->assertArrayNotHasKey('trace', $body);
        $this->assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
        $this->assertSame('DENY', $response->getHeaderLine('X-Frame-Options'));
        $this->assertSame('private, no-store', $response->getHeaderLine('Cache-Control'));

        putenv('RATE_LIMIT_AUTH_PER_MINUTE=2');
        try {
            $limited = Kernel::create(dirname(__DIR__));
            $statuses = [];
            $retry = '';
            for ($i = 0; $i < 3; $i++) {
                $auth = $factory->createServerRequest('GET', 'http://localhost/api/auth/no-such', [
                    'REMOTE_ADDR' => '203.0.113.81',
                    'REQUEST_URI' => '/api/auth/no-such',
                ]);
                $result = $limited->handle($auth);
                $statuses[] = $result->getStatusCode();
                $retry = $result->getHeaderLine('Retry-After');
            }
            $this->assertSame([404, 404, 429], $statuses);
            $this->assertNotSame('', $retry);
        } finally {
            putenv('RATE_LIMIT_AUTH_PER_MINUTE');
        }
    }
}
