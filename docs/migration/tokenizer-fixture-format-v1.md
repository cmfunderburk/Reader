# Tokenizer Fixture Format v1

Last updated: 2026-02-19

## Goal
Lock deterministic tokenizer behavior before porting to Rust (`reader_core`) so parity can be enforced with shared fixtures.

## Files
- Case definitions: `src/test/fixtures/tokenizer/tokenizer-cases.v1.json`
- Generated fixtures: `src/test/fixtures/tokenizer/tokenizer-fixtures.v1.json`
- Generator: `scripts/generate-tokenizer-fixtures.ts`
- Parity test: `src/lib/tokenizer.fixtures.test.ts`

## Case Definition Schema

```json
{
  "schema": "reader-tokenizer-cases",
  "version": 1,
  "cases": [
    {
      "id": "custom-phrase-basic",
      "description": "Human-readable intent",
      "input": {
        "text": "Input text",
        "mode": "word",
        "saccadeLength": 10
      }
    }
  ]
}
```

Notes:
- `mode` is `word` or `custom` (matches current app token mode semantics).
- `saccadeLength` is optional and only used for custom mode cases.

## Generated Fixture Schema

```json
{
  "schema": "reader-tokenizer-fixtures",
  "version": 1,
  "generatedAt": "ISO-8601 timestamp",
  "generator": "scripts/generate-tokenizer-fixtures.ts",
  "cases": [
    {
      "id": "custom-phrase-basic",
      "description": "...",
      "input": { "...": "..." },
      "output": {
        "chunks": [
          {
            "text": "The reader",
            "wordCount": 2,
            "orpIndex": 5
          }
        ]
      }
    }
  ]
}
```

## Regeneration

```bash
bun run fixtures:tokenizer
```

Regenerate whenever tokenizer behavior is intentionally changed, then run tests and review fixture diffs before commit.
