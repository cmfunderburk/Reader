import { describe, it, expect } from 'vitest';
import { annotateHtmlWords, type AnnotationResult } from './htmlAnnotator';

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
});
