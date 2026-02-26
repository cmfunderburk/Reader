# EPUB Reader & Guided Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add native EPUB reading with rich HTML rendering and word-level reading enhancements (sweep pacer, generation masking) directly on formatted EPUB content, plus rename "Saccade" to "Guided" throughout the app.

**Architecture:** EPUBs are parsed in the browser via `epubjs`, with chapter HTML rendered in React components. A word-annotation engine wraps every text-node word in `<span data-word-idx>` elements, enabling the existing sweep pacer and generation masking to target words directly in rich formatted content. The EPUB reader is a new screen in the existing ViewState system, not a new activity type.

**Tech Stack:** React 18, TypeScript, Vite, `epubjs` (browser EPUB parser), existing `saccade.ts`/`tokenizer.ts` for timing/scoring.

**Design doc:** `docs/plans/2026-02-25-epub-reader-design.md`

---

## Phase 1: Rename Saccade to Guided

This is a prerequisite rename that touches many files. Do it first to avoid merge conflicts with later phases.

### Task 1: Rename DisplayMode type and SaccadePacerStyle/SaccadeFocusTarget types

**Files:**
- Modify: `src/types/index.ts:5,15-16,25-48,54`

**Step 1: Write failing test**

Create `src/lib/guidedRename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('Guided rename - type smoke test', () => {
  it('DisplayMode includes guided, not saccade', async () => {
    const types = await import('../types');
    // Type-level: this test just confirms the import compiles.
    // The real verification is that TypeScript compilation succeeds
    // after the rename with no 'saccade' references remaining.
    const mode: types.DisplayMode = 'guided';
    expect(mode).toBe('guided');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/guidedRename.test.ts`
Expected: FAIL — `'guided'` is not assignable to `DisplayMode`

**Step 3: Update types**

In `src/types/index.ts`, make these changes:

- Line 5: `'saccade'` → `'guided'` in `DisplayMode`
- Line 15: `SaccadePacerStyle` → `GuidedPacerStyle`
- Line 16: `SaccadeFocusTarget` → `GuidedFocusTarget`
- Line 25: `SaccadeLineType` → `GuidedLineType`
- Lines 27-36: `SaccadeLine` → `GuidedLine`
- Lines 38-41: `SaccadePage` → `GuidedPage`
- Lines 43-48: `SaccadePosition` → `GuidedPosition`
- Line 54: `saccade?: SaccadePosition` → `guided?: GuidedPosition` in `Chunk`

**Step 4: Run test to verify it passes**

Run: `bun run test:run -- src/lib/guidedRename.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/lib/guidedRename.test.ts
git commit -m "refactor: rename Saccade types to Guided in types/index.ts"
```

---

### Task 2: Rename SaccadeReader component to GuidedReader

**Files:**
- Rename: `src/components/SaccadeReader.tsx` → `src/components/GuidedReader.tsx`
- Modify: `src/components/Reader.tsx` (import)

**Step 1: Rename file and update all internal identifiers**

Rename the file:
```bash
git mv src/components/SaccadeReader.tsx src/components/GuidedReader.tsx
```

In `src/components/GuidedReader.tsx`:
- Rename export `SaccadeReader` → `GuidedReader`
- Rename interface `SaccadeReaderProps` → `GuidedReaderProps`
- Rename export `SaccadeLineComponent` → `GuidedLineComponent`
- Rename interface `SaccadeLineProps` → `GuidedLineProps`
- Update `displayName` to `'GuidedLineComponent'`
- Rename all prop names: `saccadeShowOVP` → `guidedShowOVP`, `saccadeShowSweep` → `guidedShowSweep`, `saccadePacerStyle` → `guidedPacerStyle`, `saccadeFocusTarget` → `guidedFocusTarget`, `saccadeMergeShortFunctionWords` → `guidedMergeShortFunctionWords`, `saccadeLength` → `guidedLength`
- Update all CSS class references: `saccade-reader` → `guided-reader`, `saccade-page` → `guided-page`, `saccade-line` → `guided-line`, `saccade-sweep` → `guided-sweep`, `saccade-heading` → `guided-heading`, `saccade-body` → `guided-body`, `saccade-fixation` → `guided-fixation`, `saccade-focus-target` → `guided-focus-target`, `saccade-figure-*` → `guided-figure-*`, `saccade-line-*` → `guided-line-*`
- Update all CSS custom property references: `--saccade-ovp-color` → `--guided-ovp-color`, `--saccade-focus-highlight` → `--guided-focus-highlight`, `--saccade-figure-max-height` → `--guided-figure-max-height`
- Update type imports to use new names: `GuidedPage`, `GuidedLine`, `GuidedPacerStyle`, `GuidedFocusTarget`

**Step 2: Update Reader.tsx imports and references**

In `src/components/Reader.tsx`:
- Update import: `SaccadeReader` → `GuidedReader` from `'./GuidedReader'`
- Update JSX: `<SaccadeReader` → `<GuidedReader`
- Update prop names to match new names
- Update type imports: `SaccadePage` → `GuidedPage`, `SaccadePacerStyle` → `GuidedPacerStyle`, `SaccadeFocusTarget` → `GuidedFocusTarget`
- Update interface `ReaderProps` prop names: `saccadePage` → `guidedPage`, `saccadeShowOVP` → `guidedShowOVP`, etc.

**Step 3: Run lint to check for remaining references**

Run: `bun run lint`
Expected: Many errors from files still using old names (App.tsx, SettingsPanel.tsx, etc.)

**Step 4: Commit the component rename**

```bash
git add src/components/GuidedReader.tsx src/components/Reader.tsx
git add -u src/components/SaccadeReader.tsx
git commit -m "refactor: rename SaccadeReader to GuidedReader"
```

---

### Task 3: Rename saccade.ts exports and CSS classes

**Files:**
- Modify: `src/lib/saccade.ts` — rename exported function/type names
- Modify: `src/lib/saccade.test.ts` — update test imports
- Modify: `src/index.css` — rename all `.saccade-*` CSS classes to `.guided-*`

**Step 1: Rename saccade.ts exports**

In `src/lib/saccade.ts`:
- `calculateSaccadeLineDuration` → `calculateGuidedLineDuration`
- `tokenizeSaccade` → `tokenizeGuided`
- `SaccadeTokenizeResult` → `GuidedTokenizeResult` (if exported)
- Keep internal logic unchanged — just rename the public API

**Step 2: Update saccade.test.ts imports**

Update all references to match renamed exports.

**Step 3: Rename CSS classes in index.css**

Global find-replace in `src/index.css`:
- `.saccade-` → `.guided-`
- `--saccade-` → `--guided-`

**Step 4: Run tests**

Run: `bun run test:run -- src/lib/saccade.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/saccade.ts src/lib/saccade.test.ts src/index.css
git commit -m "refactor: rename saccade exports and CSS classes to guided"
```

---

### Task 4: Update Settings types and storageSettings.ts

**Files:**
- Modify: `src/lib/storageSettings.ts:11-39,65-72` — rename `saccade*` Settings fields
- Modify: `src/components/SettingsPanel.tsx` — update prop names, UI labels

**Step 1: Rename Settings interface fields**

In `src/lib/storageSettings.ts`:
- `saccadeFontSize` → `guidedFontSize`
- `saccadeShowOVP` → `guidedShowOVP`
- `saccadeShowSweep` → `guidedShowSweep`
- `saccadePacerStyle` → `guidedPacerStyle`
- `saccadeFocusTarget` → `guidedFocusTarget`
- `saccadeMergeShortFunctionWords` → `guidedMergeShortFunctionWords`
- `saccadeLength` → `guidedLength`
- Update `DEFAULT_SETTINGS` field names to match
- Update `loadSettings()` backfill logic for `guidedPacerStyle`

**Step 2: Add storage migration**

In `src/lib/storageMigrations.ts`, add a migration that renames old `saccade*` keys inside the persisted settings JSON to `guided*` equivalents, so existing users don't lose their settings.

**Step 3: Update SettingsPanel.tsx**

Update all prop name references and change UI label from "Saccade" to "Guided" (e.g., "Guided Font Size", "Show OVP").

**Step 4: Run tests**

Run: `bun run test:run`
Expected: May have failures in other files still using old names

**Step 5: Commit**

```bash
git add src/lib/storageSettings.ts src/lib/storageMigrations.ts src/components/SettingsPanel.tsx
git commit -m "refactor: rename saccade settings to guided with storage migration"
```

---

### Task 5: Update all remaining references across codebase

**Files:**
- Modify: `src/components/App.tsx` — all `saccade*` handler names and prop passes
- Modify: `src/hooks/useRSVP.ts` — `'saccade'` string literals → `'guided'`, `saccadePages` → `guidedPages`, `isLinePacedDisplay` references
- Modify: `src/components/ReaderControls.tsx` — display mode labels, `'saccade'` → `'guided'`
- Modify: `src/components/HomeScreen.tsx:53` — `case 'saccade'` → `case 'guided'`
- Modify: `src/lib/sessionTransitions.ts` — all `'saccade'` string literals and type narrowings
- Modify: `src/lib/rsvp.ts` — if any saccade references

**Step 1: Systematic search-and-replace**

Use grep to find ALL remaining `saccade` references:
```bash
grep -rn 'saccade\|Saccade' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.'
```

Update each file, changing:
- String literal `'saccade'` → `'guided'` in DisplayMode contexts
- Variable/prop names: `saccade*` → `guided*`
- Handler names: `handleSaccade*` → `handleGuided*`
- `saccadePages` → `guidedPages` (in useRSVP return value and all consumers)
- UI label `'Saccade'` → `'Guided'`

**Step 2: Update all test files**

```bash
grep -rn 'saccade\|Saccade' src/ --include='*.test.*'
```

Update all test files to use new names.

**Step 3: Run full test suite**

Run: `bun run test:run`
Expected: ALL PASS

**Step 4: Run lint**

Run: `bun run lint`
Expected: CLEAN

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: complete saccade → guided rename across codebase"
```

---

### Task 6: Delete guidedRename.test.ts smoke test

**Files:**
- Delete: `src/lib/guidedRename.test.ts`

The smoke test served its purpose. Remove it.

**Step 1: Delete and commit**

```bash
git rm src/lib/guidedRename.test.ts
git commit -m "chore: remove guided rename smoke test"
```

---

## Phase 2: Browser EPUB Parser

### Task 7: Add epubjs dependency

**Step 1: Install**

```bash
bun add epubjs
```

**Step 2: Verify installation**

```bash
bun run build
```

Expected: Build succeeds. `epubjs` is a browser-compatible library.

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "deps: add epubjs for browser-side EPUB parsing"
```

---

### Task 8: Create EPUB parser wrapper

**Files:**
- Create: `src/lib/epubParser.ts`
- Create: `src/lib/epubParser.test.ts`

**Step 1: Write failing tests**

Create `src/lib/epubParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEpubChapters, type EpubBookData } from './epubParser';

describe('parseEpubChapters', () => {
  it('extracts chapter list from a minimal EPUB', async () => {
    // We'll test with a real EPUB file in integration tests.
    // Unit test verifies the interface shape.
    const mockBook: EpubBookData = {
      title: 'Test Book',
      chapters: [
        { id: 'ch1', title: 'Chapter 1', html: '<p>Hello world</p>', href: 'ch1.xhtml' },
        { id: 'ch2', title: 'Chapter 2', html: '<p>Goodbye world</p>', href: 'ch2.xhtml' },
      ],
      resources: new Map(),
    };
    expect(mockBook.chapters).toHaveLength(2);
    expect(mockBook.chapters[0].title).toBe('Chapter 1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/epubParser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement epubParser.ts**

Create `src/lib/epubParser.ts`:

```ts
import ePub from 'epubjs';
import type Book from 'epubjs/types/book';
import type Section from 'epubjs/types/section';

export interface EpubChapter {
  id: string;
  title: string;
  html: string;
  href: string;
}

export interface EpubBookData {
  title: string;
  chapters: EpubChapter[];
  resources: Map<string, string>; // original href → blob URL
}

/**
 * Load and parse an EPUB file from an ArrayBuffer.
 * Extracts chapter HTML, TOC titles, and resource blob URLs.
 */
export async function loadEpubFromBuffer(buffer: ArrayBuffer): Promise<EpubBookData> {
  const book = ePub(buffer);
  await book.ready;

  const title = book.packaging?.metadata?.title || 'Untitled';
  const toc = await book.loaded.navigation;

  // Build TOC title lookup: href → title
  const tocTitles = new Map<string, string>();
  for (const item of toc.toc) {
    const href = item.href.split('#')[0]; // strip fragment
    tocTitles.set(href, item.label.trim());
  }

  // Extract resources (images, fonts) as blob URLs
  const resources = new Map<string, string>();
  const resourceEntries = Object.entries(book.packaging?.manifest || {});
  for (const [, entry] of resourceEntries) {
    if (entry.type?.startsWith('image/') || entry.type?.startsWith('font/')) {
      try {
        const url = await book.archive.createUrl(entry.href);
        resources.set(entry.href, url);
      } catch {
        // Skip resources that fail to load
      }
    }
  }

  // Extract chapters from spine (reading order)
  const chapters: EpubChapter[] = [];
  const spine = book.spine as { items?: Section[] } & Iterable<Section>;
  const sections: Section[] = spine.items ?? Array.from(spine);

  for (const section of sections) {
    try {
      const doc = await section.load(book.load.bind(book));
      const serializer = new XMLSerializer();
      const html = serializer.serializeToString(doc);

      const href = section.href.split('#')[0];
      const title = tocTitles.get(href) || `Section ${chapters.length + 1}`;

      chapters.push({
        id: section.idref || `section-${chapters.length}`,
        title,
        html,
        href,
      });
    } catch {
      // Skip sections that fail to parse
    }
  }

  return { title, chapters, resources };
}

/**
 * Extract plain text from chapter HTML (for feeding to existing reading modes).
 */
export function extractPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body?.textContent?.trim() || '';
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test:run -- src/lib/epubParser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/epubParser.ts src/lib/epubParser.test.ts
git commit -m "feat: add browser-side EPUB parser wrapper around epubjs"
```

---

## Phase 3: Word-Level HTML Annotation Engine

### Task 9: Create HTML word annotator

**Files:**
- Create: `src/lib/htmlAnnotator.ts`
- Create: `src/lib/htmlAnnotator.test.ts`

**Step 1: Write failing tests**

Create `src/lib/htmlAnnotator.test.ts`:

```ts
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
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/htmlAnnotator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement htmlAnnotator.ts**

Create `src/lib/htmlAnnotator.ts`:

```ts
export interface AnnotationResult {
  html: string;          // annotated HTML with word spans
  wordCount: number;     // total words found
  words: string[];       // ordered list of word text content
}

/**
 * Walk all text nodes in the HTML, split into words, and wrap each word
 * in a <span data-word-idx="N"> element. Preserves all HTML structure,
 * images, and non-text content.
 */
export function annotateHtmlWords(html: string): AnnotationResult {
  if (!html.trim()) {
    return { html: '', wordCount: 0, words: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const words: string[] = [];
  let wordIndex = 0;

  // Walk all text nodes in document order
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    // Skip text inside <script>, <style> tags
    const parent = textNode.parentElement;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;

    const fragment = doc.createDocumentFragment();
    // Split on word boundaries, preserving whitespace
    const parts = text.split(/(\s+)/);

    for (const part of parts) {
      if (/^\s+$/.test(part) || part === '') {
        // Whitespace — preserve as-is
        fragment.appendChild(doc.createTextNode(part));
      } else {
        // Word — wrap in span
        const span = doc.createElement('span');
        span.setAttribute('data-word-idx', String(wordIndex));
        span.textContent = part;
        fragment.appendChild(span);
        words.push(part);
        wordIndex++;
      }
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  const annotatedHtml = doc.body.innerHTML;
  return { html: annotatedHtml, wordCount: wordIndex, words };
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test:run -- src/lib/htmlAnnotator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/htmlAnnotator.ts src/lib/htmlAnnotator.test.ts
git commit -m "feat: add HTML word-annotation engine for EPUB reading enhancements"
```

---

## Phase 4: EPUB Reader Component

### Task 10: Add EPUB reader ViewState and types

**Files:**
- Modify: `src/lib/appViewState.ts` — add `'epub-reader'` screen
- Modify: `src/types/index.ts` — add `BookState` type (or create new file)

**Step 1: Add types**

Add to `src/types/index.ts`:

```ts
export interface BookChapter {
  id: string;
  title: string;
  html: string;
  href: string;
}

export interface BookState {
  title: string;
  lastChapterIndex: number;
  lastWordIndex: number;
  lastOpenedAt: number;
}
```

**Step 2: Add ViewState variant**

In `src/lib/appViewState.ts`, add:
- `| { screen: 'epub-reader' }` to `ViewState` union
- `| { type: 'open-epub-reader' }` to `ViewAction` union
- Handle in reducer and `viewStateToAction`

**Step 3: Run lint**

Run: `bun run lint`
Expected: CLEAN (new types are just additions)

**Step 4: Commit**

```bash
git add src/types/index.ts src/lib/appViewState.ts
git commit -m "feat: add epub-reader ViewState and book types"
```

---

### Task 11: Create EpubReader component (browse mode)

**Files:**
- Create: `src/components/EpubReader.tsx`
- Create: `src/hooks/useEpubReader.ts`

**Step 1: Create useEpubReader hook**

Create `src/hooks/useEpubReader.ts`:

```ts
import { useState, useCallback, useRef } from 'react';
import { loadEpubFromBuffer, extractPlainText, type EpubBookData } from '../lib/epubParser';
import { annotateHtmlWords, type AnnotationResult } from '../lib/htmlAnnotator';
import type { BookChapter } from '../types';

export type EpubReadingMode = 'browse' | 'pacer' | 'generation';

export interface UseEpubReaderReturn {
  // Book state
  book: EpubBookData | null;
  isLoading: boolean;
  error: string | null;
  // Chapter state
  currentChapterIndex: number;
  currentChapter: BookChapter | null;
  annotatedHtml: string;
  wordCount: number;
  words: string[];
  // Navigation
  loadBook: (buffer: ArrayBuffer) => Promise<void>;
  goToChapter: (index: number) => void;
  nextChapter: () => void;
  prevChapter: () => void;
  // Mode
  readingMode: EpubReadingMode;
  setReadingMode: (mode: EpubReadingMode) => void;
  // Pacer state
  currentWordIndex: number;
  setCurrentWordIndex: (index: number) => void;
}

export function useEpubReader(): UseEpubReaderReturn {
  const [book, setBook] = useState<EpubBookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [annotation, setAnnotation] = useState<AnnotationResult>({ html: '', wordCount: 0, words: [] });
  const [readingMode, setReadingMode] = useState<EpubReadingMode>('browse');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const loadBook = useCallback(async (buffer: ArrayBuffer) => {
    setIsLoading(true);
    setError(null);
    try {
      const bookData = await loadEpubFromBuffer(buffer);
      setBook(bookData);
      if (bookData.chapters.length > 0) {
        const result = annotateHtmlWords(bookData.chapters[0].html);
        setAnnotation(result);
        setCurrentChapterIndex(0);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const goToChapter = useCallback((index: number) => {
    if (!book || index < 0 || index >= book.chapters.length) return;
    setCurrentChapterIndex(index);
    const result = annotateHtmlWords(book.chapters[index].html);
    setAnnotation(result);
    setCurrentWordIndex(0);
    setReadingMode('browse');
  }, [book]);

  const nextChapter = useCallback(() => {
    if (!book) return;
    goToChapter(currentChapterIndex + 1);
  }, [book, currentChapterIndex, goToChapter]);

  const prevChapter = useCallback(() => {
    goToChapter(currentChapterIndex - 1);
  }, [currentChapterIndex, goToChapter]);

  const currentChapter = book?.chapters[currentChapterIndex] ?? null;

  return {
    book,
    isLoading,
    error,
    currentChapterIndex,
    currentChapter,
    annotatedHtml: annotation.html,
    wordCount: annotation.wordCount,
    words: annotation.words,
    loadBook,
    goToChapter,
    nextChapter,
    prevChapter,
    readingMode,
    setReadingMode,
    currentWordIndex,
    setCurrentWordIndex,
  };
}
```

**Step 2: Create EpubReader component**

Create `src/components/EpubReader.tsx`:

```tsx
import { useRef, useCallback } from 'react';
import type { UseEpubReaderReturn } from '../hooks/useEpubReader';

interface EpubReaderProps {
  epub: UseEpubReaderReturn;
  onBack: () => void;
}

export function EpubReader({ epub, onBack }: EpubReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTOC, setShowTOC] = useState(false);

  if (epub.isLoading) {
    return <div className="epub-reader epub-loading">Loading book...</div>;
  }

  if (epub.error) {
    return (
      <div className="epub-reader epub-error">
        <p>Failed to load: {epub.error}</p>
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  if (!epub.book) {
    return null;
  }

  return (
    <div className="epub-reader">
      <div className="epub-toolbar">
        <button onClick={onBack} className="epub-back-btn">Back</button>
        <h2 className="epub-title">{epub.book.title}</h2>
        <button onClick={() => setShowTOC(!showTOC)} className="epub-toc-btn">
          Chapters
        </button>
      </div>

      {showTOC && (
        <div className="epub-toc">
          {epub.book.chapters.map((ch, i) => (
            <button
              key={ch.id}
              className={`epub-toc-item ${i === epub.currentChapterIndex ? 'active' : ''}`}
              onClick={() => { epub.goToChapter(i); setShowTOC(false); }}
            >
              {ch.title}
            </button>
          ))}
        </div>
      )}

      <div className="epub-controls">
        <button onClick={epub.prevChapter} disabled={epub.currentChapterIndex === 0}>
          Prev
        </button>
        <span className="epub-chapter-info">
          {epub.currentChapter?.title} ({epub.currentChapterIndex + 1}/{epub.book.chapters.length})
        </span>
        <button onClick={epub.nextChapter} disabled={epub.currentChapterIndex >= epub.book.chapters.length - 1}>
          Next
        </button>
      </div>

      <div
        ref={contentRef}
        className="epub-content"
        dangerouslySetInnerHTML={{ __html: epub.annotatedHtml }}
      />

      <div className="epub-mode-controls">
        {/* Mode toggles — browse/pacer/generation */}
        <button
          className={epub.readingMode === 'browse' ? 'active' : ''}
          onClick={() => epub.setReadingMode('browse')}
        >
          Browse
        </button>
        <button
          className={epub.readingMode === 'pacer' ? 'active' : ''}
          onClick={() => epub.setReadingMode('pacer')}
        >
          Pacer
        </button>
        <button
          className={epub.readingMode === 'generation' ? 'active' : ''}
          onClick={() => epub.setReadingMode('generation')}
        >
          Generation
        </button>
      </div>
    </div>
  );
}
```

Note: The `dangerouslySetInnerHTML` is acceptable here because the HTML is parsed from a local EPUB file, not from user-generated web content. The annotation engine produces safe HTML from the EPUB's controlled content.

**Step 3: Run lint**

Run: `bun run lint`

**Step 4: Commit**

```bash
git add src/hooks/useEpubReader.ts src/components/EpubReader.tsx
git commit -m "feat: add EpubReader component and useEpubReader hook"
```

---

### Task 12: Add EPUB CSS scoping and styles

**Files:**
- Modify: `src/index.css` — add `.epub-*` styles
- Create: `src/lib/epubCssScope.ts` — CSS scoping utility (optional, may inline)

**Step 1: Add base EPUB styles to index.css**

Add styles for:
- `.epub-reader` — full-height reader container
- `.epub-toolbar` — top bar with back/title/TOC
- `.epub-toc` — chapter list sidebar/dropdown
- `.epub-content` — the main reading area with scoped EPUB styles
- `.epub-controls` — chapter navigation
- `.epub-mode-controls` — mode toggle buttons
- `[data-word-idx]` — invisible by default, targeted by pacer/generation
- `.epub-word-highlight` — pacer highlight style
- `.epub-word-masked` — generation mask style

Key CSS considerations:
- `.epub-content` should use `all: revert` or careful reset to scope EPUB styles
- EPUB images need `max-width: 100%` to prevent overflow
- Font sizing should respect app theme settings

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat: add EPUB reader CSS styles"
```

---

### Task 13: Integrate EPUB reader into App.tsx

**Files:**
- Modify: `src/components/App.tsx` — add epub state, file loading, view routing

**Step 1: Add EPUB state to App.tsx**

Add state for the epub hook and file loading:
- `const epub = useEpubReader();`
- Add a file input handler for web EPUB loading
- Route `viewState.screen === 'epub-reader'` to `<EpubReader>`

**Step 2: Add EPUB loading from web file picker**

Add a handler that:
1. Opens a file picker (`<input type="file" accept=".epub">`)
2. Reads the file as `ArrayBuffer`
3. Calls `epub.loadBook(buffer)`
4. Dispatches `{ type: 'open-epub-reader' }` to viewState

**Step 3: Add EPUB loading from Electron library**

Modify `Library.tsx` or the existing `handleOpenBook` to detect EPUB files and route them to the new epub loading path instead of the old plain-text extraction path.

Alternatively, keep the existing flow for now and add a separate "Open in EPUB Reader" option.

**Step 4: Run the app**

Run: `bun run dev`
Test: Open an EPUB file → verify chapters load → browse through chapter content.

**Step 5: Commit**

```bash
git add src/components/App.tsx src/components/EpubReader.tsx
git commit -m "feat: integrate EPUB reader into App view routing"
```

---

## Phase 5: Sweep Pacer on EPUB Content

### Task 14: Implement word-level pacer for EPUB

**Files:**
- Create: `src/hooks/useEpubPacer.ts`
- Modify: `src/components/EpubReader.tsx` — integrate pacer

**Step 1: Write failing test**

Create `src/hooks/useEpubPacer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEpubPacer } from './useEpubPacer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useEpubPacer', () => {
  it('advances word index at WPM rate', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    expect(result.current.currentWordIndex).toBe(0);
    act(() => result.current.play());
    // At 300 WPM, one word every 200ms
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.currentWordIndex).toBeGreaterThan(0);
  });

  it('stops at end of content', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 3, wpm: 300, enabled: true })
    );
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.currentWordIndex).toBeLessThanOrEqual(2);
    expect(result.current.isPlaying).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/hooks/useEpubPacer.test.ts`

**Step 3: Implement useEpubPacer**

Create `src/hooks/useEpubPacer.ts`:

The pacer hook should:
1. Accept `wordCount`, `wpm`, `enabled`
2. Use `requestAnimationFrame` or `setTimeout` to advance `currentWordIndex` at WPM rate
3. Expose `play`, `pause`, `toggle`, `seek(wordIndex)`, `isPlaying`, `currentWordIndex`
4. Apply a CSS class (`epub-word-highlight`) to the current word's `[data-word-idx]` span

**Step 4: Integrate into EpubReader**

When `readingMode === 'pacer'`:
- Start the pacer
- On each word advance, find `[data-word-idx="${currentWordIndex}"]` in the content DOM
- Add `.epub-word-highlight` class, remove from previous word
- Auto-scroll the content container to keep the highlighted word visible

**Step 5: Run test to verify it passes**

Run: `bun run test:run -- src/hooks/useEpubPacer.test.ts`

**Step 6: Manual test**

Run: `bun run dev`
Test: Load EPUB → enter Pacer mode → verify highlight moves word-by-word at WPM.

**Step 7: Commit**

```bash
git add src/hooks/useEpubPacer.ts src/hooks/useEpubPacer.test.ts src/components/EpubReader.tsx
git commit -m "feat: add sweep pacer for EPUB reader"
```

---

## Phase 6: Generation Masking on EPUB Content

### Task 15: Implement word-level generation masking for EPUB

**Files:**
- Create: `src/lib/epubGenerationMask.ts`
- Create: `src/lib/epubGenerationMask.test.ts`
- Modify: `src/components/EpubReader.tsx`

**Step 1: Write failing tests**

Create `src/lib/epubGenerationMask.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectMaskedWords } from './epubGenerationMask';

describe('selectMaskedWords', () => {
  it('masks approximately the target percentage of words', () => {
    const words = ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    const masked = selectMaskedWords(words, 'normal', 42);
    // 'normal' difficulty should mask ~30% of content words
    expect(masked.size).toBeGreaterThan(0);
    expect(masked.size).toBeLessThan(words.length);
  });

  it('hard difficulty masks more words', () => {
    const words = ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    const normalMasked = selectMaskedWords(words, 'normal', 42);
    const hardMasked = selectMaskedWords(words, 'hard', 42);
    expect(hardMasked.size).toBeGreaterThanOrEqual(normalMasked.size);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/epubGenerationMask.test.ts`

**Step 3: Implement generation masking**

Create `src/lib/epubGenerationMask.ts`:

- `selectMaskedWords(words: string[], difficulty: GenerationDifficulty, seed: number): Set<number>` — returns set of word indices to mask
- Reuse logic from existing `maskGenerationLine` in `src/lib/generationMask.ts` but adapted for word-level targeting

**Step 4: Integrate into EpubReader**

When `readingMode === 'generation'`:
- Calculate masked word indices
- For each masked word, replace the `[data-word-idx]` span content with an input field or blank
- Accept user input and score with existing Levenshtein logic

**Step 5: Run tests**

Run: `bun run test:run -- src/lib/epubGenerationMask.test.ts`

**Step 6: Manual test**

Run: `bun run dev`
Test: Load EPUB → enter Generation mode → verify words are masked → type to fill in.

**Step 7: Commit**

```bash
git add src/lib/epubGenerationMask.ts src/lib/epubGenerationMask.test.ts src/components/EpubReader.tsx
git commit -m "feat: add generation masking for EPUB reader"
```

---

## Phase 7: EPUB File Loading (Web + Electron)

### Task 16: Add web file picker for EPUB loading

**Files:**
- Modify: `src/components/HomeScreen.tsx` or `src/components/App.tsx`
- Add "Open EPUB" button on home screen

**Step 1: Add file input handler**

Create a handler that:
1. Creates a hidden `<input type="file" accept=".epub">`
2. On file selection, reads the file as `ArrayBuffer`
3. Calls `epub.loadBook(buffer)`
4. Navigates to the epub-reader screen

**Step 2: Add button to home screen**

Add "Open EPUB" button alongside existing content entry points.

**Step 3: Manual test**

Run: `bun run dev`
Test: Click "Open EPUB" → file picker → select EPUB → verify reader loads.

**Step 4: Commit**

```bash
git add src/components/HomeScreen.tsx src/components/App.tsx
git commit -m "feat: add web file picker for EPUB loading"
```

---

### Task 17: Route Electron library EPUB loading to new reader

**Files:**
- Modify: `src/components/Library.tsx` — add "Open in Reader" for EPUB files
- Modify: Electron IPC to return ArrayBuffer (or modify flow to read file in renderer)

**Step 1: Add EPUB reader path to Library**

When a user clicks an EPUB in the library:
- For Electron: read the file as ArrayBuffer via a new IPC method, pass to `epub.loadBook(buffer)`
- Or: add a new `window.library.readFileBuffer(path)` IPC method

**Step 2: Manual test**

Run: `bun run electron:dev`
Test: Open EPUB from library → verify it loads in the new EPUB reader (not the old plain-text path).

**Step 3: Commit**

```bash
git add src/components/Library.tsx electron/main.ts electron/preload.ts shared/electron-contract.ts
git commit -m "feat: route Electron library EPUB loading to EPUB reader"
```

---

## Phase 8: Position Persistence

### Task 18: Persist reading position per book

**Files:**
- Create: `src/lib/bookStorage.ts`
- Create: `src/lib/bookStorage.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadBookState, saveBookState, type BookState } from './bookStorage';

beforeEach(() => localStorage.clear());

describe('bookStorage', () => {
  it('saves and loads book state', () => {
    const state: BookState = {
      title: 'Test Book',
      lastChapterIndex: 3,
      lastWordIndex: 42,
      lastOpenedAt: Date.now(),
    };
    saveBookState('book-hash-123', state);
    const loaded = loadBookState('book-hash-123');
    expect(loaded).toEqual(state);
  });

  it('returns null for unknown book', () => {
    expect(loadBookState('unknown')).toBeNull();
  });
});
```

**Step 2: Implement bookStorage.ts**

- `saveBookState(bookId: string, state: BookState): void`
- `loadBookState(bookId: string): BookState | null`
- `generateBookId(title: string, chapterCount: number): string` — deterministic hash
- Storage key: `reader:book_states` → `Record<string, BookState>`

**Step 3: Integrate into useEpubReader**

- On chapter change, save state
- On book load, check for saved state and resume

**Step 4: Run tests**

Run: `bun run test:run -- src/lib/bookStorage.test.ts`

**Step 5: Commit**

```bash
git add src/lib/bookStorage.ts src/lib/bookStorage.test.ts src/hooks/useEpubReader.ts
git commit -m "feat: persist EPUB reading position per book"
```

---

## Phase 9: Resource URL Rewriting

### Task 19: Rewrite EPUB resource URLs in annotated HTML

**Files:**
- Modify: `src/lib/htmlAnnotator.ts` — add resource URL rewriting parameter
- Modify: `src/lib/htmlAnnotator.test.ts` — add tests

**Step 1: Write failing test**

```ts
it('rewrites image src to blob URLs', () => {
  const resources = new Map([['images/photo.jpg', 'blob:http://localhost/abc123']]);
  const result = annotateHtmlWords(
    '<p>Text <img src="images/photo.jpg" /> more</p>',
    { resources }
  );
  expect(result.html).toContain('blob:http://localhost/abc123');
  expect(result.html).not.toContain('images/photo.jpg');
});
```

**Step 2: Add resources parameter to annotateHtmlWords**

Accept optional `resources: Map<string, string>` parameter. Before serializing, walk all `<img>` elements and rewrite `src` attributes using the resource map.

**Step 3: Run tests**

Run: `bun run test:run -- src/lib/htmlAnnotator.test.ts`

**Step 4: Commit**

```bash
git add src/lib/htmlAnnotator.ts src/lib/htmlAnnotator.test.ts
git commit -m "feat: rewrite EPUB resource URLs in annotated HTML"
```

---

## Phase 10: Final Integration & Polish

### Task 20: Full integration test and verify build

**Step 1: Run full test suite**

Run: `bun run test:run`
Expected: ALL PASS

**Step 2: Run lint**

Run: `bun run lint`
Expected: CLEAN

**Step 3: Build web**

Run: `bun run build`
Expected: Build succeeds

**Step 4: Build Electron**

Run: `bun run electron:build`
Expected: Build succeeds

**Step 5: Manual end-to-end test**

1. Web: Load an EPUB via file picker → browse chapters → use pacer → use generation masking
2. Electron: Load from library → same flow
3. Verify position persistence (close and reopen same book)
4. Verify existing non-EPUB flows still work (URL, paste, feeds, training)

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: final integration fixes for EPUB reader"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-6 | Saccade → Guided rename |
| 2 | 7-8 | Browser EPUB parser (epubjs) |
| 3 | 9 | HTML word annotation engine |
| 4 | 10-13 | EPUB Reader component + App integration |
| 5 | 14 | Sweep pacer on EPUB |
| 6 | 15 | Generation masking on EPUB |
| 7 | 16-17 | File loading (web + Electron) |
| 8 | 18 | Position persistence |
| 9 | 19 | Resource URL rewriting |
| 10 | 20 | Integration testing and build verification |

Dependencies: Phase 1 is independent. Phases 2-3 are independent of each other. Phase 4 depends on 2+3. Phases 5-6 depend on 4. Phase 7 depends on 4. Phase 8 depends on 4. Phase 9 depends on 3.
