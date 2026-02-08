---
name: Library Content Preprocessor
description: This skill should be used when the user asks to "preprocess library content", "clean up a PDF", "optimize content for speed reading", "fix extracted text", "review library file", or discusses improving text quality for the speed reader. Handles variable content types including EPUBs, web-saved PDFs, academic papers, and book chapters.
---

# Library Content Preprocessor

This skill assists with preprocessing and optimizing library content for the SpeedRead application. Since library content varies significantly (Gutenberg EPUBs, web pages saved as PDFs, academic papers, scanned book chapters), automated cleanup often needs LLM-assisted finishing touches.

## Library Structure

The `library/` directory uses a processing pipeline:

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

### EPUBs (Non-Gutenberg)
- **Source**: Commercial or independently published EPUBs
- **Issues**: Structured HTML content (numbered lists, ordered items) lost during text extraction; footnote superscripts embedded inline; CSS-styled elements with no semantic HTML tags
- **Critical pitfall**: EPUB chapters use `<p>` elements with CSS classes (e.g., `class="order"`, `class="order-indent"`) for numbered lists instead of `<ol>/<li>`. These contain substantive content but are easily stripped during HTML-to-text conversion. See "Structured Content Preservation" below.
- **Example**: `How to Read a Book.epub` — ordered lists of rules, questions, and methods

### Classics (`unprocessed/classics/`)
- **Source**: Project Gutenberg EPUBs, public domain texts
- **Issues**: Gutenberg headers/footers, transcriber notes, inconsistent formatting
- **Example**: `brothers-karamazov.epub`, `nicomachean-ethics.epub`

### Articles (`unprocessed/articles/`)
- **Source**: Academic papers, web pages saved as PDF, short works
- **Issues**: Web print artifacts (timestamps, URLs), paper metadata (author blocks, abstracts), reference sections
- **Example**: `attention.pdf` (academic), `wittgenstein-lecture-on-ethics.pdf` (web-saved)

### References (`unprocessed/references/`)
- **Source**: Textbook chapters split into individual PDFs
- **Issues**: Running headers/footers, page numbers, cross-references, frontmatter files
- **Structure**: Organized by book (e.g., `kreps-micro-foundations-i/`, `osborne-rubinstein-game-theory/`)

## Structured Content Preservation (EPUB Critical)

**This is the most common source of content loss during preprocessing.** EPUBs often use CSS-styled `<p>` elements for numbered lists and ordered items instead of semantic `<ol>/<li>` tags. These look like regular paragraphs in the HTML but contain critical content (rules, steps, questions, enumerations).

### The Problem

When converting EPUB HTML to plain text, `body.textContent` or similar methods strip all HTML structure. Numbered list items in elements like `<p class="order">` become indistinguishable from surrounding prose and are often lost entirely — leaving blank lines where content should be.

**Known affected patterns** (from Calibre-formatted EPUBs):
- `<p class="order">` — numbered items (e.g., "1. WHAT IS THE BOOK ABOUT AS A WHOLE?...")
- `<p class="order-indent">` — continuation paragraphs under a numbered item
- `<p class="orderb">` / `<p class="order-indentb">` — bottom-margin variants
- `<p class="order1b">` / `<p class="order1ba">` — alternate numbering styles
- `<sup>` footnote markers embedded inline (e.g., superscript "I" becomes stray letter)

### How to Preserve Structured Content

When preprocessing EPUBs, **always extract and inspect the raw HTML** before converting to text:

```bash
# Extract raw HTML for a chapter to inspect structure
node -e "
const EPub = require('epub');
const epub = new EPub('library/BOOK.epub');
epub.on('end', () => {
  epub.getChapter('CHAPTER_ID', (err, html) => {
    // Look for ordered/list elements
    const orderCount = (html.match(/class=\"order/g) || []).length;
    if (orderCount > 0) console.log('WARNING: ' + orderCount + ' ordered items found');
    console.log(html);
  });
});
epub.parse();
"
```

When ordered items are found:
1. Parse the HTML with JSDOM
2. Extract text from `[class^="order"]` elements separately
3. Prefix each with its number (preserve the "1. ITEM TEXT" format)
4. Insert them in the correct position in the output text

### Verification After Preprocessing

**Always check for content gaps** in the output `.txt` file:

```bash
# Check for runs of 3+ consecutive blank lines (likely stripped content)
perl -0777 -ne 'print scalar(() = /\n{4,}/g)' output.txt
```

If gaps are found, compare with the source EPUB HTML to identify what was lost. Common signs:
- Text says "There are four main questions..." followed by blank lines then "We will return to these four questions..." — the questions themselves were stripped
- Text says "Here are some devices that can be used:" followed by blank lines — an enumerated list was lost
- A stray letter (like "I") at the end of a paragraph — a footnote superscript was partially extracted

## Existing Cleanup Infrastructure

The app has an automated cleanup module at `electron/lib/cleanup.ts` with these capabilities:

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

The automated cleanup handles common patterns but cannot:
- Distinguish meaningful content from boilerplate in edge cases
- Fix OCR errors or garbled text
- Identify section boundaries in poorly structured documents
- Handle content-specific decisions (keep this footnote? remove this aside?)

## Preprocessing Workflow

### Step 1: Assess Content Quality

To assess a library file, extract and examine its content:

```bash
# For PDFs - use the app's extraction
node -e "
const { extractPdfText } = require('./dist-electron/lib/pdf.js');
extractPdfText('library/articles/FILENAME.pdf', { cleanup: false })
  .then(r => console.log(r.content.substring(0, 3000)));
"

# For EPUBs - inspect raw HTML structure (critical for detecting ordered lists)
node -e "
const EPub = require('epub');
const epub = new EPub('library/BOOK.epub');
epub.on('end', () => {
  const flow = epub.flow || [];
  let pending = flow.length;
  flow.forEach((item, i) => {
    epub.getChapter(item.id, (err, html) => {
      pending--;
      if (!err && html) {
        const orderCount = (html.match(/class=\"order/g) || []).length;
        if (orderCount > 0)
          process.stdout.write(item.href + ': ' + orderCount + ' ordered items\n');
      }
      if (pending === 0) process.stdout.write('DONE\n');
    });
  });
});
epub.parse();
"
```

Or read the file directly to see raw extraction issues.

Identify:
- Content type (academic paper, book chapter, web article, literature)
- Major artifacts (page numbers, headers, metadata blocks)
- Text quality (clean extraction vs. OCR errors vs. no text layer)
- Structure (chapters, sections, continuous prose)
- **For EPUBs**: Whether chapters contain `<p class="order*">` or other structured list elements

### Step 2: Apply Automated Cleanup

Test the automated cleanup on the content:

```bash
node -e "
const { cleanupText } = require('./dist-electron/lib/cleanup.js');
const fs = require('fs');
// ... extract and clean
"
```

Note what the automated cleanup handles well and what remains.

### Step 3: LLM-Assisted Refinement

For issues the automated cleanup cannot handle, apply targeted fixes:

**Boilerplate identification**: Review extracted text and identify blocks that should be removed but weren't caught by pattern matching.

**Content decisions**: Determine whether to keep or remove:
- Translator's notes in classic literature
- Extensive footnotes that break reading flow
- Section headers that may or may not be useful
- Cross-references to figures/tables (useless without the figures)

**Text repair**: Fix:
- OCR artifacts (common character substitutions: rn→m, l→1, O→0)
- Garbled Unicode or encoding issues
- Sentence fragments from column layout extraction

### Step 4: Create Optimized Version

Options for storing optimized content:

1. **Pre-extracted text files**: Store cleaned `.txt` alongside source files
2. **Metadata files**: Create `.meta.json` with cleanup decisions
3. **Direct modification**: For user-owned content, update the source

### Step 5: Verify Output Integrity

**Always run after creating output files**, especially for EPUB sources:

```bash
# Check for content gaps (3+ consecutive blank lines = likely stripped content)
gaps=$(perl -0777 -ne 'print scalar(() = /\n{4,}/g)' output.txt)
if [ "$gaps" -gt 0 ]; then
  echo "WARNING: $gaps content gap(s) found — compare with source"
fi
```

If gaps are found:
1. Locate each gap and read the surrounding context (look for "there are N..." or "here are..." followed by blanks)
2. Compare with the source file's HTML to find what was stripped
3. Restore the missing content with proper numbered formatting

## Common Content Patterns

### Gutenberg EPUBs
```
*** START OF THE PROJECT GUTENBERG EBOOK ***
[content]
*** END OF THE PROJECT GUTENBERG EBOOK ***
Transcriber's Notes: [notes]
```
**Action**: Remove Gutenberg markers and transcriber notes unless specifically relevant.

### Web-Saved PDFs
```
12/23/25, 9:21 AM    Page Title - Website Name
https://example.com/page    1/8
-- 1 of 8 --
[content repeated with headers on each page]
```
**Action**: Remove timestamps, URLs, page fractions. The automated cleanup handles most of this.

### Academic Papers
```
Title
Author1, Author2
Institution, email@domain.com
Abstract: [abstract text]
1. Introduction
[content]
References
[bibliography]
```
**Action**: Optionally keep abstract (useful context), remove author block and references.

### Textbook Chapters
```
Chapter 5: Topic Name
[content with section numbers like 5.1, 5.2]
[running header: "Chapter 5: Topic Name" on each page]
[page numbers]
[cross-references: "See Figure 5.3" or "As shown in Section 5.1"]
```
**Action**: Remove running headers/page numbers. Keep or contextualize cross-references.

## Reference Files

For detailed patterns and edge cases:
- **`references/content-patterns.md`** - Specific patterns for each content type with examples

## Workflow Commands

When preprocessing library content:

1. **List available content**: `ls -la library/{classics,articles,references}`
2. **Check file type**: `file library/path/to/file.pdf`
3. **Extract sample**: Use node script above or read directly
4. **Test cleanup**: Apply cleanup module and review output
5. **Apply LLM fixes**: Edit cleanup.ts patterns or create content-specific overrides

## Output Considerations for Speed Reading

Optimized content for the speed reader should:

- Flow continuously without jarring breaks
- Avoid orphaned references ("See Figure 3" with no figure)
- Preserve meaningful structure (paragraph breaks, section transitions)
- Remove visual artifacts (page numbers, headers) that interrupt reading
- Keep content that aids comprehension (abstracts, key definitions)
- Remove content that breaks immersion (lengthy footnotes, bibliographies)

The goal is text that reads naturally when presented word-by-word or phrase-by-phrase at speed.

## Saccade Mode Optimization

The app supports **saccade mode** - a full-page display where a sliding highlight moves through the text. This mode benefits from specific formatting:

### Markdown Headings

Saccade mode detects and renders markdown-style headings with special formatting (centered, with blank lines above/below). When preprocessing, use markdown heading syntax:

```
# Chapter Title
## Section Heading
### Subsection
```

Headings are included in the reading sequence as chunks, providing natural pause points and context.

### Line Width

Saccade mode uses **80-character line width** (terminal/book standard). When preprocessing content for saccade mode, you can pre-wrap text at 80 characters. The app handles this automatically during display, but pre-formatting can help with content that has specific line break requirements.

### Line Breaks and RSVP

RSVP mode ignores line breaks and treats text as continuous (whitespace is collapsed). This means:
- Content formatted for saccade mode (with 80-char line breaks) works fine in RSVP
- Single line breaks within paragraphs become spaces
- Paragraph breaks (blank lines) create pause markers in RSVP

### Heading Format Examples

**Input (raw chapter):**
```
CHAPTER V
THE GRAND INQUISITOR

"Even so," Ivan laughed again...
```

**Output (formatted for saccade):**
```
# Chapter V: The Grand Inquisitor

"Even so," Ivan laughed again...
```

**Input (textbook section):**
```
5.2 Nash Equilibrium

A Nash equilibrium is a strategy profile...
```

**Output (formatted for saccade):**
```
## Nash Equilibrium

A Nash equilibrium is a strategy profile...
```

Remove redundant numbering when converting to markdown headings - the heading level itself provides hierarchy.
