<?php

declare(strict_types=1);

namespace Foundu\Tests;

use Foundu\Storage\SigV4;
use PHPUnit\Framework\TestCase;

// Published AWS examples. The secret and the date are the ones in the
// S3 signature-version-4 documentation, not a credential we use.
final class SigV4Test extends TestCase
{
    private const ACCESS = 'AKIAIOSFODNN7EXAMPLE';
    private const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    private const DATE = '20130524T000000Z';

    public function testPresignedGetMatchesTheAwsQueryExample(): void
    {
        $query = SigV4::presign(
            'GET',
            'examplebucket.s3.amazonaws.com',
            '/test.txt',
            self::ACCESS,
            self::SECRET,
            'us-east-1',
            [],
            86400,
            self::DATE
        );
        $this->assertSame(
            'https://examplebucket.s3.amazonaws.com/test.txt?'
            . 'X-Amz-Algorithm=AWS4-HMAC-SHA256'
            . '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request'
            . '&X-Amz-Date=20130524T000000Z'
            . '&X-Amz-Expires=86400'
            . '&X-Amz-SignedHeaders=host'
            . '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
            'https://examplebucket.s3.amazonaws.com/test.txt?' . $query
        );
    }

    public function testAuthorizationHeaderMatchesTheAwsGetExample(): void
    {
        $hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        $header = SigV4::authorization(
            'GET',
            '/test.txt',
            '',
            'examplebucket.s3.amazonaws.com',
            [
                'range' => 'bytes=0-9',
                'x-amz-content-sha256' => $hash,
                'x-amz-date' => self::DATE,
            ],
            $hash,
            self::ACCESS,
            self::SECRET,
            'us-east-1',
            self::DATE
        );
        $this->assertSame(
            'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
            . 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
            . 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
            $header
        );
    }

    public function testPutSignsContentTypeAndContentLength(): void
    {
        $query = SigV4::presign(
            'PUT',
            'examplebucket.s3.amazonaws.com',
            '/photos/a.jpg',
            self::ACCESS,
            self::SECRET,
            'us-east-1',
            [
                'content-type' => 'image/jpeg',
                'content-length' => '128',
            ],
            300,
            self::DATE
        );
        $this->assertStringContainsString('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost', $query);
        $this->assertStringContainsString('X-Amz-Expires=300', $query);
        $this->assertStringNotContainsString('UNSIGNED-PAYLOAD', $query);
        parse_str($query, $params);
        $this->assertSame('content-length;content-type;host', $params['X-Amz-SignedHeaders']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $params['X-Amz-Signature']);
    }
}
