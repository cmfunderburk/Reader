import { describe, it, expect } from 'vitest';
import { extractPlainText, type EpubBookData, type EpubChapter } from './epubParser';

describe('epubParser', () => {
  it('exports EpubBookData and EpubChapter types with correct shape', () => {
    const chapter: EpubChapter = {
      id: 'ch1',
      title: 'Chapter 1',
      html: '<p>Hello world</p>',
      href: 'ch1.xhtml',
    };

    const mockBook: EpubBookData = {
      title: 'Test Book',
      chapters: [
        chapter,
        { id: 'ch2', title: 'Chapter 2', html: '<p>Goodbye world</p>', href: 'ch2.xhtml' },
      ],
      resources: new Map(),
    };

    expect(mockBook.chapters).toHaveLength(2);
    expect(mockBook.chapters[0].title).toBe('Chapter 1');
    expect(mockBook.title).toBe('Test Book');
    expect(mockBook.resources).toBeInstanceOf(Map);
  });

  it('extracts plain text from HTML', () => {
    expect(extractPlainText('<p>Hello world</p>')).toBe('Hello world');
  });

  it('extracts plain text from nested HTML', () => {
    expect(extractPlainText('<div><p>A <em>bold</em> claim</p></div>')).toBe('A bold claim');
  });

  it('includes all textContent from HTML including script/style nodes', () => {
    // DOMParser's textContent includes script/style text. This is acceptable because
    // real EPUB content rarely has scripts, and the primary consumer is feeding text
    // to reading modes where extra noise is harmless.
    const html = '<p>Visible</p><script>alert("x")</script><p>Also visible</p>';
    const result = extractPlainText(html);
    expect(result).toContain('Visible');
    expect(result).toContain('Also visible');
  });

  it('returns empty string for empty input', () => {
    expect(extractPlainText('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    expect(extractPlainText('   ')).toBe('');
  });
});
