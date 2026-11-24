<?php

declare(strict_types=1);

namespace Foundu\Storage;

// What cron needs from object storage: one PUT of a file it already wrote.
// P7 owns presign and delete. If that work adds a shared signer, R2Put
// should call it instead of SigV4.
interface ObjectPut
{
    public function putFile(string $key, string $contentType, string $path): void;
}
