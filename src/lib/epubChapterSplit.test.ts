import { describe, it, expect } from 'vitest';
import { splitChapterOnHeadings } from './epubChapterSplit';
import type { EpubChapter } from './epubParser';

function makeChapter(overrides: Partial<EpubChapter> = {}): EpubChapter {
  return {
    id: 'ch1',
    title: 'Original Title',
    html: '<p>Some content</p>',
    href: 'chapter1.xhtml',
    ...overrides,
  };
}

describe('splitChapterOnHeadings', () => {
  it('returns original chapter unchanged when there are no headings', () => {
    const chapter = makeChapter({ html: '<p>Just a paragraph.</p>' });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
    expect(result).toHaveLength(1);
  });

  it('returns original chapter unchanged when there is only 1 heading', () => {
    const chapter = makeChapter({ html: '<h2>Only Heading</h2><p>Some content here.</p>' });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
    expect(result).toHaveLength(1);
  });

  it('splits on h2 headings with correct titles and content', () => {
    const chapter = makeChapter({
      html: '<h2>Chapter One</h2><p>Content one.</p><h2>Chapter Two</h2><p>Content two.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Chapter One');
    expect(result[1].title).toBe('Chapter Two');
    // Verify content separation
    expect(result[0].html).toContain('Content one.');
    expect(result[0].html).not.toContain('Content two.');
    expect(result[1].html).toContain('Content two.');
    expect(result[1].html).not.toContain('Content one.');
  });

  it('keeps frontmatter before first heading as its own chapter', () => {
    const chapter = makeChapter({
      html: '<p>Frontmatter content.</p><h2>Chapter One</h2><p>Body.</p><h2>Chapter Two</h2><p>More.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(3);
    // Frontmatter uses original title
    expect(result[0].title).toBe('Original Title');
    expect(result[0].html).toContain('Frontmatter content.');
    expect(result[1].title).toBe('Chapter One');
    expect(result[2].title).toBe('Chapter Two');
  });

  it('skips empty frontmatter (whitespace-only content before first heading)', () => {
    const chapter = makeChapter({
      html: '   \n  <h2>Chapter One</h2><p>Content one.</p><h2>Chapter Two</h2><p>Content two.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Chapter One');
    expect(result[1].title).toBe('Chapter Two');
  });

  it('assigns unique IDs to split chapters', () => {
    const chapter = makeChapter({
      id: 'big-chapter',
      html: '<h2>A</h2><p>Content A.</p><h2>B</h2><p>Content B.</p><h2>C</h2><p>Content C.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('big-chapter-split-0');
    expect(result[1].id).toBe('big-chapter-split-1');
    expect(result[2].id).toBe('big-chapter-split-2');
    // All IDs are unique
    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves href from original chapter', () => {
    const chapter = makeChapter({
      href: 'content/main.xhtml',
      html: '<h2>First</h2><p>A.</p><h2>Second</h2><p>B.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    for (const ch of result) {
      expect(ch.href).toBe('content/main.xhtml');
    }
  });

  it('handles mixed heading levels (h1, h2, h3)', () => {
    const chapter = makeChapter({
      html: '<h1>Part One</h1><p>Intro.</p><h2>Section A</h2><p>Details A.</p><h3>Subsection</h3><p>Details sub.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('Part One');
    expect(result[1].title).toBe('Section A');
    expect(result[2].title).toBe('Subsection');
  });

  it('handles empty html', () => {
    const chapter = makeChapter({ html: '' });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
    expect(result).toHaveLength(1);
  });

  it('does not split on h4/h5/h6 headings', () => {
    const chapter = makeChapter({
      html: '<h4>Not a split</h4><p>Content.</p><h5>Also not</h5><p>More.</p>',
    });
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
    expect(result).toHaveLength(1);
  });
});
