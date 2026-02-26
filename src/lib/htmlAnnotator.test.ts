import { describe, it, expect } from 'vitest';
import { annotateHtmlWords, resolveResourceUrl, type AnnotationResult } from './htmlAnnotator';

describe('annotateHtmlWords', () => {
  it('wraps words in plain text paragraph', () => {
    const result = annotateHtmlWords('<p>Hello world</p>');
    expect(result.wordCount).toBe(2);
    expect(result.html).toContain('data-word-idx="0"');
    expect(result.html).toContain('data-word-idx="1"');
    expect(result.html).toContain('>Hello<');
    expect(result.html).toContain('>world<');
  });

  it('preserves HTML structure around words', () => {
    const result = annotateHtmlWords('<p>A <em>bold</em> claim</p>');
    expect(result.wordCount).toBe(3);
    // <em> should be preserved, with the word inside wrapped
    expect(result.html).toContain('<em>');
    expect(result.html).toContain('</em>');
  });

  it('handles headings', () => {
    const result = annotateHtmlWords('<h1>Chapter One</h1><p>Text here.</p>');
    expect(result.wordCount).toBe(4); // Chapter, One, Text, here.
  });

  it('skips image elements', () => {
    const result = annotateHtmlWords('<p>Before <img src="x.png" /> after</p>');
    expect(result.wordCount).toBe(2); // Before, after
    expect(result.html).toContain('<img');
  });

  it('handles empty input', () => {
    const result = annotateHtmlWords('');
    expect(result.wordCount).toBe(0);
    expect(result.html).toBe('');
  });

  it('maps word indices to text content', () => {
    const result = annotateHtmlWords('<p>The quick brown fox</p>');
    expect(result.words).toEqual(['The', 'quick', 'brown', 'fox']);
  });

  it('handles multiple paragraphs with continuous indexing', () => {
    const result = annotateHtmlWords('<p>First paragraph</p><p>Second paragraph</p>');
    expect(result.wordCount).toBe(4);
    expect(result.words).toEqual(['First', 'paragraph', 'Second', 'paragraph']);
    expect(result.html).toContain('data-word-idx="2"');
    expect(result.html).toContain('data-word-idx="3"');
  });

  it('preserves whitespace between words', () => {
    const result = annotateHtmlWords('<p>Hello  world</p>');
    // Multiple spaces should still produce exactly 2 words
    expect(result.wordCount).toBe(2);
  });

  it('handles nested formatting elements', () => {
    const result = annotateHtmlWords('<p>A <strong><em>very bold</em></strong> statement</p>');
    expect(result.wordCount).toBe(4);
    expect(result.words).toEqual(['A', 'very', 'bold', 'statement']);
    expect(result.html).toContain('<strong>');
    expect(result.html).toContain('<em>');
  });

  it('handles punctuation attached to words', () => {
    const result = annotateHtmlWords('<p>Hello, world!</p>');
    expect(result.wordCount).toBe(2);
    expect(result.words).toEqual(['Hello,', 'world!']);
  });

  it('returns correct AnnotationResult interface', () => {
    const result: AnnotationResult = annotateHtmlWords('<p>Test</p>');
    expect(typeof result.html).toBe('string');
    expect(typeof result.wordCount).toBe('number');
    expect(Array.isArray(result.words)).toBe(true);
  });

  describe('resource URL rewriting', () => {
    it('rewrites image src to blob URLs', () => {
      const resources = new Map([['images/photo.jpg', 'blob:http://localhost/abc123']]);
      const result = annotateHtmlWords(
        '<p>Text <img src="images/photo.jpg" /> more</p>',
        { resources }
      );
      expect(result.html).toContain('blob:http://localhost/abc123');
      expect(result.html).not.toContain('src="images/photo.jpg"');
    });

    it('leaves non-matching images unchanged', () => {
      const resources = new Map([['other.jpg', 'blob:xyz']]);
      const result = annotateHtmlWords(
        '<p><img src="missing.jpg" /></p>',
        { resources }
      );
      expect(result.html).toContain('src="missing.jpg"');
    });

    it('rewrites multiple images', () => {
      const resources = new Map([
        ['img/a.png', 'blob:aaa'],
        ['img/b.png', 'blob:bbb'],
      ]);
      const result = annotateHtmlWords(
        '<p><img src="img/a.png" /> text <img src="img/b.png" /></p>',
        { resources }
      );
      expect(result.html).toContain('blob:aaa');
      expect(result.html).toContain('blob:bbb');
    });

    it('does not affect annotation when no resources provided', () => {
      const result = annotateHtmlWords('<p>Hello <img src="x.png" /> world</p>');
      expect(result.html).toContain('src="x.png"');
      expect(result.wordCount).toBe(2);
    });

    it('resolves relative paths with ../ prefix', () => {
      const resources = new Map([['images/photo.jpg', 'blob:resolved']]);
      const result = annotateHtmlWords(
        '<p>Text <img src="../images/photo.jpg" /> more</p>',
        { resources }
      );
      expect(result.html).toContain('blob:resolved');
    });

    it('resolves deeply nested ../ paths', () => {
      const resources = new Map([['images/photo.jpg', 'blob:deep']]);
      const result = annotateHtmlWords(
        '<p><img src="../../images/photo.jpg" /></p>',
        { resources }
      );
      expect(result.html).toContain('blob:deep');
    });

    it('falls back to basename-only matching', () => {
      const resources = new Map([['OEBPS/images/cover.png', 'blob:cover']]);
      const result = annotateHtmlWords(
        '<p><img src="images/cover.png" /></p>',
        { resources }
      );
      expect(result.html).toContain('blob:cover');
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
      const result = annotateHtmlWords('<p>Hello</p><script>alert("xss")</script><p>world</p>');
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('alert');
      expect(result.wordCount).toBe(2);
    });

    it('removes style elements', () => {
      const result = annotateHtmlWords('<style>body{color:red}</style><p>Hello</p>');
      expect(result.html).not.toContain('<style');
      expect(result.html).not.toContain('color:red');
      expect(result.wordCount).toBe(1);
    });

    it('strips inline event handlers', () => {
      const result = annotateHtmlWords('<p onclick="alert(1)" onmouseover="hack()">Click me</p>');
      expect(result.html).not.toContain('onclick');
      expect(result.html).not.toContain('onmouseover');
      expect(result.wordCount).toBe(2);
    });

    it('strips onerror on images', () => {
      const result = annotateHtmlWords('<p>Text <img src="x.png" onerror="alert(1)" /> more</p>');
      expect(result.html).not.toContain('onerror');
    });

    it('strips javascript: URLs from href', () => {
      const result = annotateHtmlWords('<p><a href="javascript:alert(1)">Click</a></p>');
      expect(result.html).not.toContain('javascript:');
    });

    it('strips javascript: URLs from src', () => {
      const result = annotateHtmlWords('<p><img src="javascript:alert(1)" /></p>');
      expect(result.html).not.toContain('javascript:');
    });

    it('preserves normal attributes', () => {
      const result = annotateHtmlWords('<p class="intro" id="p1">Hello</p>');
      expect(result.html).toContain('class="intro"');
      expect(result.html).toContain('id="p1"');
    });
  });
});
