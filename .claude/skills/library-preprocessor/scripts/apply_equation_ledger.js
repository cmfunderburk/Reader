#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_CONTENT_DIR = 'library/references/bayesian-stats';
const DEFAULT_LEDGER_PATH = 'library/references/bayesian-stats/equation-transcriptions.json';

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function countToken(text, token) {
  return text.split(token).length - 1;
}

function listTextFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => path.join(dirPath, name))
    .sort((a, b) => a.localeCompare(b));
}

const contentDir = getArg('--content-dir', DEFAULT_CONTENT_DIR);
const ledgerPath = getArg('--ledger', DEFAULT_LEDGER_PATH);

if (!fs.existsSync(contentDir)) {
  console.error(`Missing content directory: ${contentDir}`);
  process.exit(1);
}

if (!fs.existsSync(ledgerPath)) {
  console.error(`Missing ledger file: ${ledgerPath}`);
  process.exit(1);
}

let ledger;
try {
  ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
} catch (err) {
  console.error(`Could not parse ledger ${ledgerPath}: ${err.message}`);
  process.exit(1);
}

if (!ledger.chapters || typeof ledger.chapters !== 'object') {
  console.error('Ledger must contain a "chapters" object.');
  process.exit(1);
}

let replacedCount = 0;
let changedFiles = 0;
const unresolved = [];

for (const chapterName of Object.keys(ledger.chapters).sort()) {
  const chapter = ledger.chapters[chapterName];
  const equations = Array.isArray(chapter.equations) ? chapter.equations : [];
  if (equations.length === 0) continue;

  const defaultTextFile = path.join(contentDir, `${chapterName}.txt`);
  const textFile = chapter.text_file || defaultTextFile;

  if (!fs.existsSync(textFile)) {
    console.error(`Missing chapter file: ${textFile}`);
    process.exit(1);
  }

  let original = fs.readFileSync(textFile, 'utf8');
  let updated = original;

  for (const eq of equations) {
    const index = Number(eq.index);
    const placeholder = eq.placeholder || `[EQN_IMAGE:${index}]`;
    const action = typeof eq.action === 'string' ? eq.action : 'replace';
    const replacement = typeof eq.unicode === 'string' ? eq.unicode.trim() : '';
    const occurrences = countToken(updated, placeholder);

    if (occurrences === 0) continue;

    if (action === 'drop') {
      updated = updated.split(placeholder).join('');
      replacedCount += occurrences;
      continue;
    }

    if (!replacement) {
      unresolved.push({
        chapter: chapterName,
        index,
        placeholder,
        occurrences
      });
      continue;
    }

    updated = updated.split(placeholder).join(replacement);
    replacedCount += occurrences;
  }

  if (updated !== original) {
    fs.writeFileSync(textFile, updated, 'utf8');
    changedFiles += 1;
  }
}

const remainingPlaceholders = [];
for (const filePath of listTextFiles(contentDir)) {
  const text = fs.readFileSync(filePath, 'utf8');
  const matches = [...text.matchAll(/\[EQN_IMAGE:(\d+)\]/g)];
  if (matches.length === 0) continue;

  remainingPlaceholders.push({
    file: filePath,
    count: matches.length,
    indexes: [...new Set(matches.map((m) => Number(m[1])))]
  });
}

console.log(`Files updated: ${changedFiles}`);
console.log(`Equation placeholders replaced: ${replacedCount}`);

if (unresolved.length > 0) {
  console.log('\nUnresolved mappings:');
  for (const item of unresolved.slice(0, 40)) {
    console.log(
      `- ${item.chapter} ${item.placeholder} (occurrences: ${item.occurrences})`
    );
  }
  if (unresolved.length > 40) {
    console.log(`- ... and ${unresolved.length - 40} more`);
  }
}

if (remainingPlaceholders.length > 0) {
  console.log('\nRemaining placeholders in chapter files:');
  for (const item of remainingPlaceholders) {
    console.log(`- ${item.file}: ${item.count} placeholders (${item.indexes.join(', ')})`);
  }
}

if (unresolved.length > 0 || remainingPlaceholders.length > 0) {
  process.exit(1);
}

console.log('\nAll equation placeholders resolved.');
