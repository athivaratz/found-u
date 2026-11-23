<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Auth\Turnstile;
use Foundu\Auth\FormPoster;
use Foundu\Http\ErrorHandler;
use Foundu\Http\HttpError;
use Foundu\Http\JsonBody;
use Foundu\Validation\Input;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class JsonAndTurnstileTest extends TestCase
{
    public function testJsonRejectsTheWrongTypeAndADeepDocument(): void
    {
        $this->assertTrue(JsonBody::accepts('application/json; charset=utf-8'));
        $this->assertFalse(JsonBody::accepts('text/plain'));
        $this->assertSame(['a' => 1], JsonBody::decode('{"a":1}', 100));
        try {
            JsonBody::decode("{\"a\":\"\xFF\"}", 100);
            $this->fail('expected invalid utf-8');
        } catch (HttpError $e) {
            $this->assertSame('invalid_json', $e->error);
        }

        try {
            JsonBody::decode('{"a":', 100);
            $this->fail('expected invalid json');
        } catch (HttpError $e) {
            $this->assertSame(400, $e->status);
            $this->assertSame('invalid_json', $e->error);
        }

        $deep = '{"a":' . str_repeat('{"a":', 20) . '1' . str_repeat('}', 21);
        try {
            JsonBody::decode($deep, 10000);
            $this->fail('expected the depth cap');
        } catch (HttpError $e) {
            $this->assertSame('invalid_json', $e->error);
        }

        $this->assertSame(JsonBody::VISION_MAX, JsonBody::maxFor('/vision', 262144, 65536));
        $this->assertSame(JsonBody::VISION_MAX, JsonBody::maxFor('/agent/chat', 262144, 65536));
        $this->assertSame(65536, JsonBody::maxFor('/agent/test-providers', 262144, 65536));
        $this->assertSame(65536, JsonBody::maxFor('/ner', 262144, 65536));
        $this->assertSame(262144, JsonBody::maxFor('/health', 262144, 65536));
    }

    public function testInputChecks(): void
    {
        $id = Input::studentId(['studentId' => '12345']);
        $this->assertSame('12345', $id);
        $this->assertSame('lost', Input::enum(['type' => 'lost'], 'type', ['lost', 'found']));
        try {
            Input::studentId(['studentId' => '1234']);
            $this->fail('expected a bad student id');
        } catch (HttpError $e) {
            $this->assertSame('studentId', $e->extra['field']);
        }
    }

    public function testTurnstileSkipsWhenDisabledAndFailsClosed(): void
    {
        $poster = new class implements FormPoster {
            public int $calls = 0;
            public function post(string $url, array $fields, int $timeoutSeconds): string
            {
                $this->calls++;
                return '{"success":true}';
            }
        };
        $off = new Turnstile(['TURNSTILE_ENABLED' => '0', 'TURNSTILE_SECRET' => 'secret'], $poster, 5);
        $skipped = $off->verify('token', '203.0.113.1');
        $this->assertTrue($skipped->ok);
        $this->assertTrue($skipped->skipped);
        $this->assertSame(0, $poster->calls);

        $on = new Turnstile(['TURNSTILE_ENABLED' => '1', 'TURNSTILE_SECRET' => ''], $poster, 5);
        $failed = $on->verify('token', '203.0.113.1');
        $this->assertFalse($failed->ok);
        $this->assertSame(0, $poster->calls);

        $live = new Turnstile(['TURNSTILE_SECRET' => 'secret'], $poster, 5);
        $passed = $live->verify('token', '203.0.113.1');
        $this->assertTrue($passed->ok);
        $this->assertFalse($passed->skipped);
        $this->assertSame(1, $poster->calls);
    }

    public function testErrorsDoNotCarryATrace(): void
    {
        $handler = new ErrorHandler(['APP_ENV' => 'production'], static function (): void {
            throw new \RuntimeException('db down');
        });
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'http://localhost/api/health');
        $response = $handler($request, new \RuntimeException("nope\n#0 /secret.php"));
        $body = json_decode((string) $response->getBody(), true);
        $this->assertSame('server_error', $body['error']);
        $this->assertArrayNotHasKey('detail', $body);
        $this->assertArrayNotHasKey('trace', $body);
        $this->assertStringNotContainsString('secret.php', (string) $response->getBody());
        $this->assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
        $this->assertSame('DENY', $response->getHeaderLine('X-Frame-Options'));

        $local = new ErrorHandler(['APP_ENV' => 'local'], static function (): void {
            throw new \RuntimeException('db down');
        });
        $localResponse = $local($request, new \RuntimeException('boom'));
        $localBody = json_decode((string) $localResponse->getBody(), true);
        $this->assertSame('boom', $localBody['detail']);
        $this->assertArrayNotHasKey('trace', $localBody);

        $limited = $handler($request, HttpError::tooMany(12));
        $this->assertSame(429, $limited->getStatusCode());
        $this->assertSame('12', $limited->getHeaderLine('Retry-After'));
        $limitedBody = json_decode((string) $limited->getBody(), true);
        $this->assertSame('too_many_requests', $limitedBody['error']);
        $this->assertSame(12000, $limitedBody['retryAfterMs']);
    }
}
