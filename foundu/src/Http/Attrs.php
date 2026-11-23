<?php

declare(strict_types=1);

namespace Foundu\Http;

// Request attributes later routes read. Set by the middleware in Kernel.
final class Attrs
{
    public const CLIENT = 'client';
    public const ACTOR = 'actor';
    public const SESSION = 'session';
    public const JSON = 'json';
    public const COOKIES = 'cookies';
}
