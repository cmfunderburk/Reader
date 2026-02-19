import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TokenMode } from '../types';
import { tokenize } from './tokenizer';

interface FixtureCase {
  id: string;
  description: string;
  input: {
    text: string;
    mode: TokenMode;
    saccadeLength?: number;
  };
  output: {
    chunks: ReturnType<typeof tokenize>;
  };
}

interface FixtureFile {
  schema: 'reader-tokenizer-fixtures';
  version: 1;
  cases: FixtureCase[];
}

function loadFixtureFile(): FixtureFile {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    testDir,
    '..',
    'test',
    'fixtures',
    'tokenizer',
    'tokenizer-fixtures.v1.json',
  );
  const parsed = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Partial<FixtureFile>;
  if (parsed.schema !== 'reader-tokenizer-fixtures' || parsed.version !== 1 || !Array.isArray(parsed.cases)) {
    throw new Error('Invalid tokenizer fixture file');
  }
  return parsed as FixtureFile;
}

describe('tokenizer fixture parity', () => {
  const fixture = loadFixtureFile();

  for (const fixtureCase of fixture.cases) {
    it(`matches fixture ${fixtureCase.id}`, () => {
      const actual = tokenize(
        fixtureCase.input.text,
        fixtureCase.input.mode,
        fixtureCase.input.saccadeLength,
      );
      expect(actual, fixtureCase.description).toEqual(fixtureCase.output.chunks);
    });
  }
});
