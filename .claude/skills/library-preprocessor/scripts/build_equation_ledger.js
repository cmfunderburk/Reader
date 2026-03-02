#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_CONTENT_DIR = 'library/references/bayesian-stats';
const DEFAULT_IMAGES_DIR = '/tmp/bayesian_ch_imgs';
const DEFAULT_LEDGER_PATH = 'library/references/bayesian-stats/equation-transcriptions.json';

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function loadManifestMap(chapterImageDir) {
  const manifestPath = path.join(chapterImageDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { byPlaceholder: new Map(), manifestPath: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`Could not parse manifest ${manifestPath}: ${err.message}`);
    return { byPlaceholder: new Map(), manifestPath };
  }

  const byPlaceholder = new Map();
  if (Array.isArray(manifest)) {
    manifest.forEach((item, idx) => {
      // In chapter text, [EQN_IMAGE:n] uses the global image order index (1-based),
      // counting both equations and figures.
      const placeholderIndex = idx + 1;
      if (item && item.type === 'equation') {
        byPlaceholder.set(placeholderIndex, item);
      }
    });
  }

  return { byPlaceholder, manifestPath };
}

const contentDir = getArg('--content-dir', DEFAULT_CONTENT_DIR);
const imagesDir = getArg('--images-dir', DEFAULT_IMAGES_DIR);
const ledgerPath = getArg('--ledger', DEFAULT_LEDGER_PATH);

if (!fs.existsSync(contentDir)) {
  console.error(`Missing content directory: ${contentDir}`);
  process.exit(1);
}

let existingLedger = null;
if (fs.existsSync(ledgerPath)) {
  try {
    existingLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch (err) {
    console.error(`Could not parse existing ledger at ${ledgerPath}: ${err.message}`);
    process.exit(1);
  }
}

const existingUnicode = new Map();
const existingAction = new Map();
if (existingLedger && existingLedger.chapters) {
  for (const [chapterName, chapterData] of Object.entries(existingLedger.chapters)) {
    const equations = Array.isArray(chapterData.equations) ? chapterData.equations : [];
    for (const eq of equations) {
      const idx = Number(eq.index);
      const unicode = typeof eq.unicode === 'string' ? eq.unicode : '';
      const action = typeof eq.action === 'string' ? eq.action : '';
      existingUnicode.set(`${chapterName}:${idx}`, unicode);
      existingAction.set(`${chapterName}:${idx}`, action);
    }
  }
}

const files = fs
  .readdirSync(contentDir)
  .filter((name) => name.endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b));

const ledger = {
  _meta: {
    generated_at: new Date().toISOString(),
    content_dir: contentDir,
    images_dir: imagesDir,
    total_chapters: 0,
    total_equations: 0,
    mapping_warnings: 0
  },
  chapters: {}
};

for (const file of files) {
  const chapterName = path.basename(file, '.txt');
  const textFile = path.join(contentDir, file);
  const text = fs.readFileSync(textFile, 'utf8');
  const matches = [...text.matchAll(/\[EQN_IMAGE:(\d+)\]/g)];

  if (matches.length === 0) continue;

  const chapter = {
    text_file: textFile,
    image_dir: path.join(imagesDir, chapterName),
    manifest_path: null,
    equations: []
  };

  const { byPlaceholder, manifestPath } = loadManifestMap(chapter.image_dir);
  chapter.manifest_path = manifestPath;

  for (const match of matches) {
    const index = Number(match[1]); // placeholder number in chapter text
    const key = `${chapterName}:${index}`;
    const unicode = existingUnicode.get(key) || '';
    const action = existingAction.get(key) || 'replace';
    const manifestEq = byPlaceholder.get(index);
    const imageFile = manifestEq && manifestEq.file ? manifestEq.file : `eqn_${index}.jpeg`;
    const imagePath = path.join(chapter.image_dir, imageFile);

    if (!manifestEq) {
      ledger._meta.mapping_warnings += 1;
    }

    chapter.equations.push({
      index,
      placeholder: `[EQN_IMAGE:${index}]`,
      action,
      equation_index: manifestEq && Number.isFinite(Number(manifestEq.idx)) ? Number(manifestEq.idx) : null,
      image_file: imageFile,
      image_path: imagePath,
      image_src: manifestEq && typeof manifestEq.src === 'string' ? manifestEq.src : null,
      unicode
    });
  }

  ledger.chapters[chapterName] = chapter;
  ledger._meta.total_chapters += 1;
  ledger._meta.total_equations += countMatches(text, /\[EQN_IMAGE:\d+\]/g);
}

fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');

let unresolved = 0;
for (const chapterData of Object.values(ledger.chapters)) {
  for (const eq of chapterData.equations) {
    if (!eq.unicode || !eq.unicode.trim()) unresolved += 1;
  }
}

console.log(`Ledger written: ${ledgerPath}`);
console.log(`Chapters with equations: ${ledger._meta.total_chapters}`);
console.log(`Total equation placeholders: ${ledger._meta.total_equations}`);
console.log(`Mapping warnings: ${ledger._meta.mapping_warnings}`);
console.log(`Unresolved transcriptions: ${unresolved}`);
