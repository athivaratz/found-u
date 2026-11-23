<?php

declare(strict_types=1);

namespace Foundu\Cms;

// Allowlist for rich text that an admin pastes into help sections.
// Plain sentences are kept as typed, including a lone "<".
// A string that already looks like markup is rebuilt from the tags below.
// Anything else (script, svg, event handlers, javascript: links) is dropped.
final class Html
{
    private const ALLOW = [
        'p' => true,
        'br' => true,
        'strong' => true,
        'em' => true,
        'b' => true,
        'i' => true,
        's' => true,
        'ul' => true,
        'ol' => true,
        'li' => true,
        'code' => true,
        'pre' => true,
        'blockquote' => true,
        'h2' => true,
        'h3' => true,
        'a' => true,
    ];

    private const DROP = [
        'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
        'link', 'meta', 'base', 'form', 'input', 'textarea', 'button',
        'video', 'audio', 'source', 'img', 'picture', 'canvas', 'template',
    ];

    public static function fragment(string $html): string
    {
        if (!self::looksLikeMarkup($html)) {
            return $html;
        }
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $wrapped = '<div>' . $html . '</div>';
        $dom->loadHTML('<?xml encoding="utf-8">' . $wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $root = $dom->getElementsByTagName('div')->item(0);
        if (!$root instanceof \DOMElement) {
            return '';
        }
        return self::children($root, 0);
    }

    private static function looksLikeMarkup(string $html): bool
    {
        return preg_match('/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/', $html) === 1
            || preg_match('/\bon[a-z]+\s*=/i', $html) === 1
            || preg_match('/javascript\s*:/i', $html) === 1;
    }

    private static function children(\DOMNode $node, int $depth): string
    {
        if ($depth > 32) {
            return '';
        }
        $html = '';
        foreach ($node->childNodes as $child) {
            $html .= self::render($child, $depth);
        }
        return $html;
    }

    private static function render(\DOMNode $node, int $depth): string
    {
        if ($node instanceof \DOMText) {
            return htmlspecialchars($node->textContent, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        if (!$node instanceof \DOMElement) {
            return '';
        }
        $tag = strtolower($node->tagName);
        if (in_array($tag, self::DROP, true)) {
            return '';
        }
        $inner = self::children($node, $depth + 1);
        if (!isset(self::ALLOW[$tag])) {
            return $inner;
        }
        if ($tag === 'br') {
            return '<br>';
        }
        if ($tag === 'a') {
            $href = self::href($node->getAttribute('href'));
            if ($href === null) {
                return $inner;
            }
            $safe = htmlspecialchars($href, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $rel = preg_match('#^https?://#i', $href) === 1 ? ' rel="noopener noreferrer"' : '';
            return '<a href="' . $safe . '"' . $rel . '>' . $inner . '</a>';
        }
        return '<' . $tag . '>' . $inner . '</' . $tag . '>';
    }

    public static function href(string $href): ?string
    {
        $href = trim($href);
        if ($href === '' || strlen($href) > 2048 || str_contains($href, "\0")) {
            return null;
        }
        $probe = $href;
        for ($i = 0; $i < 2; $i++) {
            $decoded = html_entity_decode(rawurldecode($probe), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if ($decoded === $probe) {
                break;
            }
            $probe = $decoded;
        }
        $flat = strtolower((string) preg_replace('/[\s\x00-\x1f]+/', '', $probe));
        foreach (['javascript:', 'vbscript:', 'data:', 'file:'] as $bad) {
            if (str_starts_with($flat, $bad)) {
                return null;
            }
        }
        if (preg_match('#^https://#i', $href) === 1 || preg_match('#^http://#i', $href) === 1) {
            return preg_match('/\s/', $href) === 1 ? null : $href;
        }
        if (preg_match('#^mailto:[^\s<>]+$#i', $href) === 1) {
            return $href;
        }
        if (str_starts_with($href, '/') && !str_starts_with($href, '//') && !str_contains($href, '\\') && !str_contains($href, '..')) {
            return $href;
        }
        return null;
    }
}
