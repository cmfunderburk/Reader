import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/lib/tokenizer';
import type { TokenMode } from '../src/types';

interface TokenizerInput {
  text: string;
  mode: TokenMode;
  saccadeLength?: number;
}

interface CaseDefinition {
  id: string;
  description: string;
  input: TokenizerInput;
}

interface CasesFile {
  schema: 'reader-tokenizer-cases';
  version: 1;
  cases: CaseDefinition[];
}

interface FixtureFile {
  schema: 'reader-tokenizer-fixtures';
  version: 1;
  generatedAt: string;
  generator: string;
  cases: Array<CaseDefinition & { output: { chunks: ReturnType<typeof tokenize> } }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const casesPath = path.join(
  repoRoot,
  'src',
  'test',
  'fixtures',
  'tokenizer',
  'tokenizer-cases.v1.json',
);
const outputPath = path.join(
  repoRoot,
  'src',
  'test',
  'fixtures',
  'tokenizer',
  'tokenizer-fixtures.v1.json',
);

function parseCases(raw: string): CasesFile {
  const parsed = JSON.parse(raw) as Partial<CasesFile>;
  if (parsed.schema !== 'reader-tokenizer-cases' || parsed.version !== 1 || !Array.isArray(parsed.cases)) {
    throw new Error('Invalid tokenizer cases file shape.');
  }
  return parsed as CasesFile;
}

function run(): void {
  const cases = parseCases(readFileSync(casesPath, 'utf-8'));
  const fixture: FixtureFile = {
    schema: 'reader-tokenizer-fixtures',
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-tokenizer-fixtures.ts',
    cases: cases.cases.map((entry) => ({
      id: entry.id,
      description: entry.description,
      input: entry.input,
      output: {
        chunks: tokenize(entry.input.text, entry.input.mode, entry.input.saccadeLength),
      },
    })),
  };

  writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${fixture.cases.length} tokenizer fixture cases to ${outputPath}`);
}

run();
