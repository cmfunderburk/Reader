import { describe, it, expect } from 'vitest';
import { extractPlainText, flattenToc, type EpubBookData, type EpubChapter } from './epubParser';

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

  it('strips script and style content from extracted text', () => {
    const html = '<p>Visible</p><script>alert("x")</script><style>body{color:red}</style><p>Also visible</p>';
    const result = extractPlainText(html);
    expect(result).toContain('Visible');
    expect(result).toContain('Also visible');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
  });

  it('returns empty string for empty input', () => {
    expect(extractPlainText('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    expect(extractPlainText('   ')).toBe('');
  });

  describe('flattenToc', () => {
    it('flattens a flat TOC', () => {
      const items = [
        { href: 'ch1.xhtml', label: 'Chapter 1' },
        { href: 'ch2.xhtml', label: 'Chapter 2' },
      ];
      expect(flattenToc(items)).toEqual([
        { href: 'ch1.xhtml', label: 'Chapter 1' },
        { href: 'ch2.xhtml', label: 'Chapter 2' },
      ]);
    });

    it('flattens nested subitems', () => {
      const items = [
        {
          href: 'part1.xhtml',
          label: 'Part 1',
          subitems: [
            { href: 'ch1.xhtml', label: 'Chapter 1' },
            { href: 'ch2.xhtml', label: 'Chapter 2' },
          ],
        },
        { href: 'part2.xhtml', label: 'Part 2' },
      ];
      expect(flattenToc(items)).toEqual([
        { href: 'part1.xhtml', label: 'Part 1' },
        { href: 'ch1.xhtml', label: 'Chapter 1' },
        { href: 'ch2.xhtml', label: 'Chapter 2' },
        { href: 'part2.xhtml', label: 'Part 2' },
      ]);
    });

    it('handles deeply nested items', () => {
      const items = [
        {
          href: 'a.xhtml',
          label: 'A',
          subitems: [
            {
              href: 'b.xhtml',
              label: 'B',
              subitems: [
                { href: 'c.xhtml', label: 'C' },
              ],
            },
          ],
        },
      ];
      expect(flattenToc(items)).toEqual([
        { href: 'a.xhtml', label: 'A' },
        { href: 'b.xhtml', label: 'B' },
        { href: 'c.xhtml', label: 'C' },
      ]);
    });

    it('handles empty subitems', () => {
      const items = [
        { href: 'ch1.xhtml', label: 'Chapter 1', subitems: [] },
      ];
      expect(flattenToc(items)).toEqual([
        { href: 'ch1.xhtml', label: 'Chapter 1' },
      ]);
    });

    it('handles empty input', () => {
      expect(flattenToc([])).toEqual([]);
    });
  });
});
