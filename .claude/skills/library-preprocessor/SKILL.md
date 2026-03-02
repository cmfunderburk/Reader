---
name: Library Content Preprocessor
description: Use when preprocessing/importing local source material (EPUB, PDF, or text bundles) into Reader-ready chapter files, including structure cleanup, section splitting, figure/equation handling, structured content preservation, and extraction QA. Handles variable content types including EPUBs, web-saved PDFs, academic papers, and book chapters.
---

# Library Content Preprocessor

Converts local source content into Reader-ready chapter files for Saccade, RSVP, Recall, and Prediction workflows. Content varies significantly (Gutenberg EPUBs, commercial EPUBs, web-saved PDFs, academic papers, textbook chapters), so automated cleanup often needs LLM-assisted finishing touches.

## Output Contract (Reader-ready)

- One UTF-8 `.txt` file per chapter/section in stable reading order.
- Output location: `library/<collection>/<book-slug>/`.
- Paragraphs separated by one blank line.
- No HTML artifacts, page labels, or scanner metadata.
- Use markdown headings (`#`, `##`, `###`) for chapter/section structure (see Saccade Mode Optimization).
- If figures are present:
  - Marker line: `[FIGURE:<id>]`
  - **Figure IDs must be globally unique across the entire book** because the app resolves all figures from a single shared `images/` directory per book. Use `chNN-N` format (e.g., `ch02-1`, `ch11-5`) where `NN` is the chapter file prefix number and `N` is the per-chapter image sequence number.
  - Optional caption line: `[FIGURE <caption text>]`
  - Store figure image files as `images/<id>.jpg` inside the book directory.
- If unresolved equation images remain: `[EQN_IMAGE:<n>]` placeholders (per-chapter numbering).

## Library Structure

```
library/
├── unprocessed/          # Raw content awaiting cleanup
│   ├── classics/         # Gutenberg EPUBs, public domain texts
│   ├── articles/         # Academic papers, web PDFs, short works
│   └── references/       # Textbook chapters by book
├── classics/             # Processed classics (ready for reading)
├── articles/             # Processed articles
└── references/           # Processed reference materials
```

**Workflow**: Content starts in `unprocessed/`, gets cleaned via this skill, then moves to the appropriate processed directory.

## Content Types and Their Challenges

### EPUBs (Gutenberg and Non-Gutenberg)
- **Gutenberg**: Headers/footers, transcriber notes, inconsistent formatting
- **Non-Gutenberg**: CSS-styled structured content lost during text extraction; footnote superscripts inline; no semantic HTML tags for lists
- **Critical pitfall**: EPUB chapters use `<p>` elements with CSS classes (e.g., `class="order"`) for numbered lists instead of `<ol>/<li>`. See Workflow B for preservation strategy.

### Articles (`unprocessed/articles/`)
- Web print artifacts (timestamps, URLs), paper metadata, reference sections

### References (`unprocessed/references/`)
- Running headers/footers, page numbers, cross-references, organized by book

See `references/content-patterns.md` for detailed patterns per content type.

## Workflow A: Plan Source → Output

1. Confirm source and target paths.
2. Decide split strategy before extraction:
   - EPUB: TOC/flow IDs and heading anchors.
   - PDF: heading regex boundaries (`No. <n>`, `Chapter <n>`, etc.).
3. Keep source-specific extraction helpers local when tied to copyrighted content.

## Workflow B: EPUB Import

### Step 1: Inspect Reading Flow

**Important**: Write epub/JSDOM scripts to temp files rather than using `node -e` inline. The Bash tool escapes `!` characters, breaking `if (!err)` and similar patterns. Use `NODE_PATH=./node_modules` when running from `/tmp`.

```javascript
// /tmp/inspect_flow.js — run with: NODE_PATH=./node_modules node /tmp/inspect_flow.js "<source.epub>"
const EPub = require('epub');
const epub = new EPub(process.argv[2]);
epub.on('end', () => (epub.flow || []).forEach((item, i) => {
  console.log(i, item.id, item.href, item.title || '');
}));
epub.parse();
```

### Step 2: Detect Structured Content (Critical)

**This is the most common source of content loss.** EPUBs often use CSS-styled `<p>` elements for numbered lists instead of semantic `<ol>/<li>` tags. These look like regular paragraphs in HTML but contain critical content.

**Known affected CSS class patterns** (Calibre-formatted EPUBs):
- `order` — numbered items
- `order-indent` — continuation paragraphs under a numbered item
- `orderb` / `order-indentb` — bottom-margin variants
- `order1b` / `order1ba` / `order1b1` — alternate numbering styles
- `<sup>` footnote markers embedded inline (extract as stray characters)

Scan all chapters for structured content:

```javascript
// /tmp/detect_structured.js — run with: NODE_PATH=./node_modules node /tmp/detect_structured.js "<source.epub>"
const EPub = require('epub');
const { JSDOM } = require('jsdom');
const epub = new EPub(process.argv[2]);
epub.on('end', () => {
  const flow = epub.flow || [];
  let pending = flow.length;
  flow.forEach(item => {
    epub.getChapter(item.id, (err, html) => {
      pending--;
      if (!err && html) {
        const dom = new JSDOM(html);
        const items = dom.window.document.querySelectorAll('[class^="order"]');
        if (items.length > 0) {
          process.stdout.write(item.href + ': ' + items.length + ' items\n');
          items.forEach(el => {
            const text = el.textContent.trim().substring(0, 80);
            process.stdout.write('  [' + el.className + '] ' + text + '\n');
          });
        }
      }
      if (pending === 0) process.stdout.write('DONE\n');
    });
  });
});
epub.parse();
```

When ordered items are found:
1. Parse the HTML with JSDOM
2. Extract text from `[class^="order"]` elements separately
3. Prefix each with its number (preserve "1. ITEM TEXT" format)
4. Insert them in the correct position in the output text

### Step 2b: Scan for Images, Figures, and Equations

Scan all chapters for `<img>` tags to plan figure/equation handling:

Write a scan script to a temp file (inline `-e` scripts break on `!` due to shell escaping — always use temp files for JSDOM/epub scripts):

```javascript
// /tmp/scan_patterns.js — run with: NODE_PATH=./node_modules node /tmp/scan_patterns.js "<source.epub>"
const EPub = require('epub');
const { JSDOM } = require('jsdom');
const epub = new EPub(process.argv[2]);
epub.on('end', () => {
  const flow = epub.flow || [];
  let pending = flow.length;
  flow.forEach(item => {
    epub.getChapter(item.id, (err, html) => {
      pending--;
      if (!err && html) {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const sups = doc.querySelectorAll('sup');
        const imgs = doc.querySelectorAll('img');
        const tables = doc.querySelectorAll('table');
        if (sups.length + imgs.length + tables.length > 0) {
          console.log(`${item.id}: ${imgs.length} imgs, ${sups.length} sups, ${tables.length} tables`);
        }
      }
      if (pending === 0) console.log('DONE');
    });
  });
});
epub.parse();
```

### Step 3: Extract and Normalize

Extract in flow order and split by in-text chapter headings when needed. Normalize:
- Collapse broken intra-word wraps.
- Remove Gutenberg boilerplate/HTML/entity artifacts.
- Preserve deliberate lists and headings.
- Convert chapter/section headings to markdown format (see Saccade Mode Optimization).
- Strip footnote superscripts (stray letters like "I" at end of paragraphs).
- **XHTML pitfall**: Some EPUBs use self-closing `<em/>` tags (empty emphasis). JSDOM's HTML parser treats these as unclosed `<em>` tags that swallow all subsequent content. Preprocess HTML with `html.replace(/<em\/>/g, '<em></em>')` before parsing.

### Step 4: Verify Content Integrity

Check for content gaps in each output `.txt` file:

```bash
perl -0777 -ne 'print scalar(() = /\n{4,}/g)' output.txt
```

Signs of stripped content:
- "There are four main questions..." followed by blank lines then "We will return to these..." — the questions were stripped
- "Here are some devices:" followed by blank lines — an enumerated list was lost
- A stray letter at the end of a paragraph — a footnote superscript was partially extracted

## Workflow C: PDF Import (Heading-Based Splitting)

Use for long-form PDFs where sections must be split into chapter files.

1. Extract raw text:
   ```bash
   pdftotext "<source.pdf>" /tmp/extracted.txt
   ```
2. Verify heading boundaries exist:
   ```bash
   rg -n '<heading-pattern>' /tmp/extracted.txt | head
   ```
3. Split by heading boundaries and emit files in target directory:
   - Frontmatter files: `00-<name>.txt`
   - Chapter files: `01-<name>.txt` through `NN-<name>.txt`
4. Strip recurring page noise during cleanup (running headers, page numbers, URLs, etc.)

## Workflow D: Figures and Equation Placeholders

Use only when source content contains figure/equation images.

### Step 1: Extract Images from EPUB

The `epub` library provides `epub.getImage(manifestId, callback)` to extract image data. The manifest ID can be found from `<img>` src attributes: the src format is `/images/{manifestId}/OEBPS/images/...`.

Write a per-chapter extraction script that:
1. Parses each chapter's HTML to find all `<img>` tags in order
2. Extracts the manifest ID from each img src
3. Classifies each as equation or figure (see classification below)
4. Numbers images sequentially per chapter (both types share one counter)
5. Extracts image data via `epub.getImage(manifestId, (err, data, mimeType) => ...)`
6. Saves to per-chapter directories: `/tmp/<book>-images/<chapter-name>/`
7. Writes a `manifest.json` per chapter mapping index → type, filename, manifest src
8. Updates text files with numbered placeholders: `[EQN_IMAGE:N]` and `[FIGURE:N]`

### Step 2: Classify Images

Use manifest ID patterns to classify (these are heuristics — verify in Step 4):
- **Inline equations**: IDs containing `Art_in`, `Art_oneby`, `Art_twoby`, `Art_arr`, `Art_mdash`, `Art_vcirc`, `Art_sqrt`, `Art_sigma`, etc.
- **Page-level figures**: IDs containing `Art_P` (followed by page number)
- **Skip**: cover images, publisher logos, title page art

**Classification pitfall**: Some prefixes are ambiguous. `Art_fg` (which looks like "figure") was used for both inline equations and actual chart/diagram figures. Always verify classification against surrounding text context in Step 4.

### Step 3: Make Figure IDs Globally Unique

**Critical**: All chapter `.txt` files share a single `images/` directory. Per-chapter figure numbers (`[FIGURE:1]`) collide across chapters.

After extraction, rename all figure markers to globally unique IDs:
- `[FIGURE:2]` in `04-the-science-of-many-models.txt` → `[FIGURE:ch04-2]`
- Copy `fig_2.jpg` → `images/ch04-2.jpg`

The final `images/` directory lives at `library/<collection>/<book-slug>/images/`.

### Step 4: Verify Image Classification

After extraction, visually spot-check a sample of images to catch misclassifications:
- Read a few `eqn_N.jpg` files — are they actually equations (fractions, symbols, formulas) or diagrams/charts?
- If figures were misclassified as equations: convert `[EQN_IMAGE:N]` → `[FIGURE:chNN-N]` in the text, remove from the equation ledger, and copy the image to the `images/` directory.

### Step 5: Build Equation Ledger

```bash
node .claude/skills/library-preprocessor/scripts/build_equation_ledger.js \
  --content-dir "library/<collection>/<book-slug>" \
  --images-dir "<temp-image-dir>" \
  --ledger "library/<collection>/<book-slug>/equation-transcriptions.json"
```

### Step 6: Transcribe Equations

For books with many equations (100+), batch transcription across parallel agents (~40 equations per batch). Each agent:
1. Reads each equation image file visually
2. Reads surrounding text context for disambiguation
3. Transcribes to Unicode following `references/unicode-equation-format.md`
4. Writes results to a temp JSON file

Merge all batch results into the ledger, then apply:

```bash
node .claude/skills/library-preprocessor/scripts/apply_equation_ledger.js \
  --content-dir "library/<collection>/<book-slug>" \
  --ledger "library/<collection>/<book-slug>/equation-transcriptions.json"
```

The apply script supports `action: "replace"` (substitute unicode), `action: "drop"` (remove placeholder). Entries with empty `unicode` and no special action are reported as unresolved.

## Workflow E: QA and Validation

Run before considering import complete:

```bash
# File count and empty file check
find "library/<collection>/<book-slug>" -maxdepth 1 -type f -name '*.txt' | wc -l
find "library/<collection>/<book-slug>" -maxdepth 1 -type f -name '*.txt' -size 0

# Artifact scan
rg -n "<[^>]+>|&[a-z]+;|page_[0-9]+|Online Library of Liberty|PLL v" "library/<collection>/<book-slug>"/*.txt

# Content gap detection (3+ consecutive blank lines)
for f in library/<collection>/<book-slug>/*.txt; do
  gaps=$(perl -0777 -ne 'print scalar(() = /\n{4,}/g)' "$f")
  if [ "$gaps" -gt 0 ]; then echo "$f: $gaps"; fi
done
```

If equations should be resolved:
```bash
rg -n "\\[EQN_IMAGE:" "library/<collection>/<book-slug>"/*.txt
```

If figure markers should exist:
```bash
rg -n "\\[FIGURE:" "library/<collection>/<book-slug>"/*.txt
```

## Workflow F: PDF Import with Docling

Use when a PDF benefits from stronger layout handling (figures/formulas/tables). PDF only — Docling does not support EPUB.

1. Run the converter:
   ```bash
   uvx --python 3.12 --from docling python \
     .claude/skills/library-preprocessor/scripts/docling_pdf_to_reader.py \
     --input-pdf "<source.pdf>" \
     --output-dir "library/<collection>/<book-slug>" \
     --pdf-backend pypdfium2 \
     --drop-markdown-tables \
     --save-raw-markdown
   ```
2. Optional section splitting:
   ```bash
   uvx --python 3.12 --from docling python \
     .claude/skills/library-preprocessor/scripts/docling_pdf_to_reader.py \
     --input-pdf "<source.pdf>" \
     --output-dir "library/<collection>/<book-slug>" \
     --chapter-regex '^Chapter\\s+[0-9]+' \
     --keep-frontmatter
   ```
3. Optional figure image export:
   ```bash
   uvx --python 3.12 --from docling python \
     .claude/skills/library-preprocessor/scripts/docling_pdf_to_reader.py \
     --input-pdf "<source.pdf>" \
     --output-dir "library/<collection>/<book-slug>" \
     --export-figure-images
   ```
4. Run Workflow E QA checks.
5. If equation placeholders remain, continue with Workflow D.

## Existing Cleanup Infrastructure

The app has an automated cleanup module at `electron/lib/cleanup.ts`:

```typescript
interface CleanupOptions {
  removeReferences?: boolean      // Bibliography sections
  removeAbstract?: boolean        // Academic abstracts
  removeAffiliations?: boolean    // Author emails, institutions
  removePageNumbers?: boolean     // Various page number formats
  removeFootnotes?: boolean       // Bracketed footnote markers
  repairHyphenation?: boolean     // Rejoin split words
  normalizeLineBreaks?: boolean   // Fix mid-sentence breaks
  removeRunningHeaders?: boolean  // Repeated page headers
  removeWebMetadata?: boolean     // URLs, timestamps, CC notices
}
```

Test automated cleanup on extracted content:

```bash
node -e "
const { cleanupText } = require('./dist-electron/lib/cleanup.js');
const fs = require('fs');
// ... extract and clean
"
```

The automated cleanup handles common patterns but cannot distinguish meaningful content from boilerplate in edge cases, fix OCR errors, identify section boundaries in poorly structured documents, or make content-specific decisions.

## LLM-Assisted Refinement

For issues automation cannot handle:

- **Boilerplate identification**: Review and identify blocks that weren't caught by pattern matching.
- **Content decisions**: Keep or remove translator's notes, footnotes, section headers, cross-references to figures/tables.
- **Text repair**: Fix OCR artifacts (`rn`→`m`, `l`→`1`, `O`→`0`), garbled Unicode, column layout fragments.

## Saccade Mode Optimization

Saccade mode displays full-page text with a sliding highlight. It detects and renders markdown headings with special formatting (centered, blank lines above/below).

### Heading Format

Convert source headings to markdown:

```
# Chapter Title
## Section Heading
### Subsection
```

**Examples:**

Raw: `CHAPTER V / THE GRAND INQUISITOR` → `# Chapter V: The Grand Inquisitor`

Raw: `5.2 Nash Equilibrium` → `## Nash Equilibrium`

Remove redundant numbering — heading level provides hierarchy.

### Line Width and Mode Compatibility

- Saccade mode uses **80-character line width**. Pre-wrapping at 80 chars is optional (app handles it).
- RSVP mode ignores line breaks (whitespace collapsed). Content formatted for saccade works fine in RSVP.
- Paragraph breaks (blank lines) create pause markers in RSVP.

## Output Considerations for Speed Reading

Optimized content should:

- Flow continuously without jarring breaks
- Avoid orphaned references ("See Figure 3" with no figure)
- Preserve meaningful structure (paragraph breaks, section transitions)
- Remove visual artifacts (page numbers, headers) that interrupt reading
- Keep content that aids comprehension (abstracts, key definitions)
- Remove content that breaks immersion (lengthy footnotes, bibliographies)

## Reference Files

- `references/content-patterns.md` — Detailed patterns per content type with examples
- `references/unicode-equation-format.md` — Unicode math formatting rules for equation transcriptions
- `examples/preprocessing-workflow.md` — Example preprocessing a web-saved PDF

## Completion Criteria

- Expected chapter/section files exist and are non-empty.
- File ordering and naming are stable and scan-friendly.
- No obvious extraction artifacts remain.
- Reader modes can parse chapter text cleanly.
- Figures/equations are either resolved or intentionally preserved with markers.
- If figures present: `images/` directory exists with one `.jpg` per `[FIGURE:id]` marker, IDs are globally unique (`chNN-N` format), and figures render in the Electron app (re-open from Library to verify — cached articles use stale content).
