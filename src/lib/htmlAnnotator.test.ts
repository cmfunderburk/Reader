import { describe, it, expect } from 'vitest';
import { sanitizeEpubHtml, resolveResourceUrl, maskHtmlTextNodes } from './htmlAnnotator';

describe('sanitizeEpubHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeEpubHtml('')).toBe('');
    expect(sanitizeEpubHtml('   ')).toBe('');
  });

  it('preserves plain text paragraphs', () => {
    const result = sanitizeEpubHtml('<p>Hello world</p>');
    expect(result).toContain('<p>');
    expect(result).toContain('Hello world');
  });

  it('preserves HTML structure', () => {
    const result = sanitizeEpubHtml('<p>A <em>bold</em> claim</p>');
    expect(result).toContain('<em>');
    expect(result).toContain('</em>');
  });

  it('preserves headings', () => {
    const result = sanitizeEpubHtml('<h1>Chapter One</h1><p>Text here.</p>');
    expect(result).toContain('<h1>');
    expect(result).toContain('Chapter One');
  });

  it('preserves images', () => {
    const result = sanitizeEpubHtml('<p>Before <img src="x.png" /> after</p>');
    expect(result).toContain('<img');
    expect(result).toContain('src="x.png"');
  });

  describe('resource URL rewriting', () => {
    it('rewrites image src to blob URLs', () => {
      const resources = new Map([['images/photo.jpg', 'blob:http://localhost/abc123']]);
      const result = sanitizeEpubHtml(
        '<p>Text <img src="images/photo.jpg" /> more</p>',
        { resources },
      );
      expect(result).toContain('blob:http://localhost/abc123');
      expect(result).not.toContain('src="images/photo.jpg"');
    });

    it('leaves non-matching images unchanged', () => {
      const resources = new Map([['other.jpg', 'blob:xyz']]);
      const result = sanitizeEpubHtml(
        '<p><img src="missing.jpg" /></p>',
        { resources },
      );
      expect(result).toContain('src="missing.jpg"');
    });

    it('rewrites multiple images', () => {
      const resources = new Map([
        ['img/a.png', 'blob:aaa'],
        ['img/b.png', 'blob:bbb'],
      ]);
      const result = sanitizeEpubHtml(
        '<p><img src="img/a.png" /> text <img src="img/b.png" /></p>',
        { resources },
      );
      expect(result).toContain('blob:aaa');
      expect(result).toContain('blob:bbb');
    });

    it('does not affect output when no resources provided', () => {
      const result = sanitizeEpubHtml('<p>Hello <img src="x.png" /> world</p>');
      expect(result).toContain('src="x.png"');
    });

    it('resolves relative paths with ../ prefix', () => {
      const resources = new Map([['images/photo.jpg', 'blob:resolved']]);
      const result = sanitizeEpubHtml(
        '<p>Text <img src="../images/photo.jpg" /> more</p>',
        { resources },
      );
      expect(result).toContain('blob:resolved');
    });

    it('resolves deeply nested ../ paths', () => {
      const resources = new Map([['images/photo.jpg', 'blob:deep']]);
      const result = sanitizeEpubHtml(
        '<p><img src="../../images/photo.jpg" /></p>',
        { resources },
      );
      expect(result).toContain('blob:deep');
    });

    it('falls back to basename-only matching', () => {
      const resources = new Map([['OEBPS/images/cover.png', 'blob:cover']]);
      const result = sanitizeEpubHtml(
        '<p><img src="images/cover.png" /></p>',
        { resources },
      );
      expect(result).toContain('blob:cover');
    });
  });

  describe('resolveResourceUrl', () => {
    const resources = new Map([
      ['images/photo.jpg', 'blob:exact'],
      ['fonts/serif.woff', 'blob:font'],
    ]);

    it('returns exact match', () => {
      expect(resolveResourceUrl('images/photo.jpg', resources)).toBe('blob:exact');
    });

    it('strips ../ and matches', () => {
      expect(resolveResourceUrl('../images/photo.jpg', resources)).toBe('blob:exact');
    });

    it('strips multiple ../ and matches', () => {
      expect(resolveResourceUrl('../../images/photo.jpg', resources)).toBe('blob:exact');
    });

    it('falls back to basename match', () => {
      expect(resolveResourceUrl('other/path/photo.jpg', resources)).toBe('blob:exact');
    });

    it('returns undefined for no match', () => {
      expect(resolveResourceUrl('missing.png', resources)).toBeUndefined();
    });
  });

  describe('HTML sanitization', () => {
    it('removes script elements', () => {
      const result = sanitizeEpubHtml('<p>Hello</p><script>alert("xss")</script><p>world</p>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    it('removes style elements', () => {
      const result = sanitizeEpubHtml('<style>body{color:red}</style><p>Hello</p>');
      expect(result).not.toContain('<style');
      expect(result).not.toContain('color:red');
    });

    it('strips inline event handlers', () => {
      const result = sanitizeEpubHtml('<p onclick="alert(1)" onmouseover="hack()">Click me</p>');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
    });

    it('strips onerror on images', () => {
      const result = sanitizeEpubHtml('<p>Text <img src="x.png" onerror="alert(1)" /> more</p>');
      expect(result).not.toContain('onerror');
    });

    it('strips javascript: URLs from href', () => {
      const result = sanitizeEpubHtml('<p><a href="javascript:alert(1)">Click</a></p>');
      expect(result).not.toContain('javascript:');
    });

    it('strips javascript: URLs from src', () => {
      const result = sanitizeEpubHtml('<p><img src="javascript:alert(1)" /></p>');
      expect(result).not.toContain('javascript:');
    });

    it('preserves normal attributes', () => {
      const result = sanitizeEpubHtml('<p class="intro" id="p1">Hello</p>');
      expect(result).toContain('class="intro"');
      expect(result).toContain('id="p1"');
    });
  });
});

describe('maskHtmlTextNodes', () => {
  it('returns empty string for empty input', () => {
    expect(maskHtmlTextNodes('', 'normal', 42)).toBe('');
    expect(maskHtmlTextNodes('   ', 'normal', 42)).toBe('');
  });

  it('preserves HTML structure', () => {
    const result = maskHtmlTextNodes('<p>The <em>remarkable</em> philosophy</p>', 'normal', 42);
    expect(result).toContain('<p>');
    expect(result).toContain('</p>');
    expect(result).toContain('<em>');
    expect(result).toContain('</em>');
  });

  it('preserves function words', () => {
    const result = maskHtmlTextNodes('<p>the is a an</p>', 'normal', 42);
    expect(result).toContain('the');
    expect(result).toContain('is');
    expect(result).toContain('a');
    expect(result).toContain('an');
  });

  it('is deterministic for same seed', () => {
    const html = '<p>The remarkable philosophical understanding</p>';
    const a = maskHtmlTextNodes(html, 'normal', 42);
    const b = maskHtmlTextNodes(html, 'normal', 42);
    expect(a).toBe(b);
  });

  it('harder difficulty masks more characters', () => {
    const html = '<p>The remarkable philosophical understanding extraordinary</p>';
    const normal = maskHtmlTextNodes(html, 'normal', 42);
    const hard = maskHtmlTextNodes(html, 'hard', 42);
    const recall = maskHtmlTextNodes(html, 'recall', 42);
    const countMasks = (s: string) => (s.match(/_/g) || []).length;
    expect(countMasks(hard)).toBeGreaterThanOrEqual(countMasks(normal));
    expect(countMasks(recall)).toBeGreaterThanOrEqual(countMasks(hard));
  });

  it('handles multiple paragraphs', () => {
    const result = maskHtmlTextNodes(
      '<p>The remarkable philosophy</p><p>Another extraordinary paragraph</p>',
      'normal',
      42,
    );
    expect(result.match(/<p>/g)?.length).toBe(2);
    expect(result).toContain('_');
  });

  it('preserves images', () => {
    const result = maskHtmlTextNodes(
      '<p>The remarkable <img src="photo.jpg" /> philosophy</p>',
      'normal',
      42,
    );
    expect(result).toContain('<img src="photo.jpg">');
  });
});
