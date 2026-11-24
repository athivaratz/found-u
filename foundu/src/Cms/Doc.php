<?php

declare(strict_types=1);

namespace Foundu\Cms;

use Foundu\Http\HttpError;

// TipTap JSON the blog editor saves. The page renders a fixed set of nodes.
// Unknown nodes are removed. Links and images have to pass the same href check
// as help HTML, so a javascript: URL never lands in the database.
final class Doc
{
    private const NODES = [
        'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
        'blockquote', 'horizontalRule', 'image', 'codeBlock', 'text',
        'hardBreak', 'stepHeading', 'videoEmbed',
    ];

    private const MARKS = ['bold', 'italic', 'code', 'link', 'strike'];

    public static function clean(mixed $value): array
    {
        if (!is_array($value) || array_is_list($value) || ($value['type'] ?? '') !== 'doc') {
            throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
        }
        $content = $value['content'] ?? [];
        if (!is_array($content) || ($content !== [] && !array_is_list($content))) {
            throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
        }
        return ['type' => 'doc', 'content' => self::list($content, 0, 0)[0]];
    }

    private static function list(array $nodes, int $depth, int $count): array
    {
        if ($depth > 12) {
            throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
        }
        $clean = [];
        foreach ($nodes as $node) {
            if ($count > 500) {
                throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
            }
            $count++;
            if (!is_array($node) || array_is_list($node)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
            }
            $type = $node['type'] ?? '';
            if (!is_string($type) || !in_array($type, self::NODES, true)) {
                continue;
            }
            $next = ['type' => $type];
            $attrs = self::attrs($type, $node['attrs'] ?? null);
            if ($attrs === false) {
                continue;
            }
            if (is_array($attrs)) {
                $next['attrs'] = $attrs;
            }
            if ($type === 'text') {
                $text = $node['text'] ?? '';
                if (!is_string($text) || str_contains($text, "\0") || mb_strlen($text) > 20000) {
                    throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
                }
                $next['text'] = $text;
                $marks = self::marks($node['marks'] ?? null);
                if ($marks !== []) {
                    $next['marks'] = $marks;
                }
            } elseif (isset($node['content'])) {
                if (!is_array($node['content']) || !array_is_list($node['content'])) {
                    throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
                }
                [$children, $count] = self::list($node['content'], $depth + 1, $count);
                $next['content'] = $children;
            }
            $clean[] = $next;
        }
        return [$clean, $count];
    }

    private static function attrs(string $type, mixed $attrs): array|false|null
    {
        if ($attrs === null) {
            return null;
        }
        if (!is_array($attrs) || array_is_list($attrs)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
        }
        if ($type === 'heading') {
            $level = $attrs['level'] ?? 2;
            if ($level !== 2 && $level !== 3) {
                $level = 2;
            }
            return ['level' => $level];
        }
        if ($type === 'image') {
            $src = is_string($attrs['src'] ?? null) ? Html::href($attrs['src']) : null;
            if ($src === null) {
                return false;
            }
            $alt = is_string($attrs['alt'] ?? null) ? mb_substr($attrs['alt'], 0, 300) : '';
            return ['src' => $src, 'alt' => $alt];
        }
        if ($type === 'codeBlock') {
            $language = is_string($attrs['language'] ?? null) ? strtolower($attrs['language']) : 'plaintext';
            if (preg_match('/^[a-z0-9#+]{1,32}$/', $language) !== 1) {
                $language = 'plaintext';
            }
            return ['language' => $language];
        }
        if ($type === 'stepHeading') {
            $title = is_string($attrs['title'] ?? null) ? trim($attrs['title']) : '';
            if ($title === '' || mb_strlen($title) > 200) {
                return false;
            }
            return ['title' => $title];
        }
        if ($type === 'videoEmbed') {
            $provider = $attrs['provider'] ?? 'youtube';
            if (!is_string($provider) || !in_array($provider, ['youtube', 'bunny', 'file'], true)) {
                $provider = 'youtube';
            }
            $src = is_string($attrs['src'] ?? null) ? Html::href($attrs['src']) : null;
            if ($src === null || !str_starts_with(strtolower($src), 'https://')) {
                return false;
            }
            $title = is_string($attrs['title'] ?? null) ? mb_substr($attrs['title'], 0, 200) : '';
            return ['provider' => $provider, 'src' => $src, 'title' => $title];
        }
        return null;
    }

    private static function marks(mixed $marks): array
    {
        if ($marks === null) {
            return [];
        }
        if (!is_array($marks) || !array_is_list($marks)) {
            throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
        }
        $clean = [];
        foreach ($marks as $mark) {
            if (!is_array($mark) || array_is_list($mark)) {
                throw new HttpError(400, 'invalid_input', ['field' => 'content_json']);
            }
            $type = $mark['type'] ?? '';
            if (!is_string($type) || !in_array($type, self::MARKS, true)) {
                continue;
            }
            $next = ['type' => $type];
            if ($type === 'link') {
                $attrs = $mark['attrs'] ?? null;
                $href = is_array($attrs) ? ($attrs['href'] ?? null) : null;
                $safe = is_string($href) ? Html::href($href) : null;
                if ($safe === null) {
                    continue;
                }
                $link = ['href' => $safe];
                if (is_array($attrs) && ($attrs['target'] ?? null) === '_blank') {
                    $link['target'] = '_blank';
                }
                $next['attrs'] = $link;
            }
            $clean[] = $next;
        }
        return $clean;
    }
}
