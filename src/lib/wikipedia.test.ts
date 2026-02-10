import { describe, it, expect } from 'vitest';
import { isWikipediaSource, normalizeWikipediaContentForReader } from './wikipedia';

describe('normalizeWikipediaContentForReader', () => {
  it('converts wiki headings and strips citation artifacts', () => {
    const raw = [
      'Lead paragraph with citation[1] and note[nb 2].',
      '',
      '== History ==',
      '',
      'History paragraph with [citation needed] marker.',
    ].join('\n');

    const normalized = normalizeWikipediaContentForReader(raw);
    expect(normalized).toContain('Lead paragraph with citation and note.');
    expect(normalized).toContain('## History');
    expect(normalized).toContain('History paragraph with marker.');
    expect(normalized).not.toContain('[1]');
    expect(normalized).not.toContain('[citation needed]');
  });

  it('drops trailing reference-style sections', () => {
    const raw = [
      'Lead paragraph.',
      '',
      '== History ==',
      '',
      'Historical details.',
      '',
      '== References ==',
      '',
      'Reference list that should be removed.',
      '',
      '== External links ==',
      '',
      'Should also be removed.',
    ].join('\n');

    const normalized = normalizeWikipediaContentForReader(raw);
    expect(normalized).toContain('## History');
    expect(normalized).toContain('Historical details.');
    expect(normalized).not.toContain('## References');
    expect(normalized).not.toContain('External links');
    expect(normalized).not.toContain('Reference list that should be removed.');
  });
});

describe('isWikipediaSource', () => {
  it('matches wikipedia source labels used by the app', () => {
    expect(isWikipediaSource('Wikipedia Daily')).toBe(true);
    expect(isWikipediaSource('Wikipedia Featured')).toBe(true);
    expect(isWikipediaSource('Library')).toBe(false);
  });
});
