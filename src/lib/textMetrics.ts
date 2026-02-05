import { stripMarkdown } from './tokenizer';

export interface TextMetrics {
  charCount: number;
  wordCount: number;
}

export function measureTextMetrics(text: string): TextMetrics {
  const clean = stripMarkdown(text);
  const normalized = clean.replace(/\s+/g, ' ').trim();
  const words = normalized.length > 0 ? normalized.split(' ') : [];
  const charCount = clean.replace(/\s/g, '').length;
  return {
    charCount,
    wordCount: words.length,
  };
}
