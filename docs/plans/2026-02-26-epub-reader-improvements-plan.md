# EPUB Reader Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix EPUB image display, add pagination, split monolithic chapters on headings, replace word-highlight pacer with a sweep bar, and replace whole-word generation masking with character-level masking.

**Architecture:** All EPUB content renders in monospace font, enabling `ch`-unit sweep bar animations and character-level masking. Pagination uses CSS columns with `translateX` page sliding. Chapter splitting happens in the parser before the rest of the system sees the data.

**Tech Stack:** React 18, TypeScript, CSS columns, epub.js, existing `generationMask.ts` masking logic.

---

### Task 1: Image Display Fix

**Files:**
- Modify: `src/index.css:3416-3420` (`.epub-content img` rule)

**Step 1: Update the CSS rule**

Replace the existing `.epub-content img` block:

```css
.epub-content img {
  max-width: 100%;
  max-height: 80vh;
  height: auto;
  object-fit: contain;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
}
```

**Step 2: Verify visually**

Run: `bun run dev` (or `bun run electron:dev`)
Open the Enquiry EPUB — cover image should be centered, constrained to 80% viewport height, and not overflow.

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "fix: constrain EPUB images to 80vh and center them"
```

---

### Task 2: Monospace Font for EPUB Content

**Files:**
- Modify: `src/index.css:3404-3414` (`.epub-content` rule)

**Step 1: Add monospace font-family to `.epub-content`**

Add to the existing `.epub-content` rule:

```css
.epub-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace;
  font-size: 1.05rem;
  line-height: 1.7;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}
```

**Step 2: Override EPUB-embedded font declarations**

Add after the `.epub-content a` rule (after line 3440):

```css
.epub-content * {
  font-family: inherit !important;
}
```

**Step 3: Verify visually**

Open an EPUB — all text should render in JetBrains Mono. No serif/sans-serif fonts from the EPUB itself.

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: use monospace font for all EPUB content"
```

---

### Task 3: Chapter Splitting for Monolithic EPUBs

**Files:**
- Modify: `src/lib/epubParser.ts:75-100`
- Create: `src/lib/epubChapterSplit.ts`
- Create: `src/lib/epubChapterSplit.test.ts`

**Step 1: Write the splitting function tests**

Create `src/lib/epubChapterSplit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { splitChapterOnHeadings } from './epubChapterSplit';

describe('splitChapterOnHeadings', () => {
  it('returns original chapter unchanged when it has 0-1 headings', () => {
    const chapter = {
      id: 'ch1',
      title: 'Chapter 1',
      html: '<h1>Title</h1><p>Content here.</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
  });

  it('splits on h2 headings', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '<h2>Section A</h2><p>Text A</p><h2>Section B</h2><p>Text B</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Section A');
    expect(result[0].html).toContain('Text A');
    expect(result[0].html).not.toContain('Text B');
    expect(result[1].title).toBe('Section B');
    expect(result[1].html).toContain('Text B');
  });

  it('keeps frontmatter before first heading as its own chapter', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '<p>Frontmatter</p><h1>Chapter 1</h1><p>Body</p><h1>Chapter 2</h1><p>More</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('Original');
    expect(result[0].html).toContain('Frontmatter');
    expect(result[1].title).toBe('Chapter 1');
    expect(result[2].title).toBe('Chapter 2');
  });

  it('skips empty frontmatter before first heading', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '   <h2>First</h2><p>Text</p><h2>Second</h2><p>More</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
  });

  it('assigns unique IDs to split chapters', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '<h1>A</h1><p>Text</p><h1>B</h1><p>Text</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves href from original chapter', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '<h1>A</h1><p>Text</p><h1>B</h1><p>Text</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    for (const ch of result) {
      expect(ch.href).toBe('ch1.xhtml');
    }
  });

  it('handles mixed heading levels (splits on h1, h2, h3)', () => {
    const chapter = {
      id: 'ch1',
      title: 'Original',
      html: '<h1>Part</h1><p>Intro</p><h3>Sub</h3><p>Detail</p>',
      href: 'ch1.xhtml',
    };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Part');
    expect(result[1].title).toBe('Sub');
  });

  it('handles empty html', () => {
    const chapter = { id: 'ch1', title: 'Empty', html: '', href: 'ch1.xhtml' };
    const result = splitChapterOnHeadings(chapter);
    expect(result).toEqual([chapter]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/epubChapterSplit.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the splitting function**

Create `src/lib/epubChapterSplit.ts`:

```typescript
import type { EpubChapter } from './epubParser';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

/**
 * Split a chapter at h1/h2/h3 boundaries into multiple virtual chapters.
 * Returns the original chapter unchanged if it has fewer than 2 headings.
 */
export function splitChapterOnHeadings(chapter: EpubChapter): EpubChapter[] {
  if (!chapter.html.trim()) return [chapter];

  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter.html, 'text/html');
  const body = doc.body;
  if (!body) return [chapter];

  // Count headings among top-level children
  const children = Array.from(body.childNodes);
  let headingCount = 0;
  for (const node of children) {
    if (node.nodeType === Node.ELEMENT_NODE && HEADING_TAGS.has((node as Element).tagName)) {
      headingCount++;
    }
  }

  if (headingCount < 2) return [chapter];

  // Split into segments at heading boundaries
  const segments: { title: string; nodes: Node[] }[] = [];
  let currentNodes: Node[] = [];
  let currentTitle: string | null = null;

  for (const node of children) {
    const isHeading = node.nodeType === Node.ELEMENT_NODE && HEADING_TAGS.has((node as Element).tagName);

    if (isHeading) {
      // Flush previous segment
      if (currentNodes.length > 0) {
        segments.push({
          title: currentTitle ?? chapter.title,
          nodes: currentNodes,
        });
      }
      currentTitle = (node as Element).textContent?.trim() || `Section ${segments.length + 1}`;
      currentNodes = [node];
    } else {
      currentNodes.push(node);
    }
  }

  // Flush final segment
  if (currentNodes.length > 0) {
    segments.push({
      title: currentTitle ?? chapter.title,
      nodes: currentNodes,
    });
  }

  // Filter out empty frontmatter (whitespace-only text before first heading)
  const filtered = segments.filter(seg => {
    const text = seg.nodes.map(n => n.textContent || '').join('').trim();
    return text.length > 0;
  });

  if (filtered.length < 2) return [chapter];

  // Build chapter objects
  const serializer = new XMLSerializer();
  return filtered.map((seg, i) => {
    const html = seg.nodes.map(n => serializer.serializeToString(n)).join('');
    return {
      id: `${chapter.id}-split-${i}`,
      title: seg.title,
      html,
      href: chapter.href,
    };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test:run -- src/lib/epubChapterSplit.test.ts`
Expected: All tests pass.

**Step 5: Integrate into epubParser.ts**

In `src/lib/epubParser.ts`, after the spine loop (line 100), add chapter splitting:

```typescript
import { splitChapterOnHeadings } from './epubChapterSplit';
```

Then replace the `return` at line 102 with:

```typescript
  // Split monolithic chapters that contain multiple headings
  const splitChapters: EpubChapter[] = [];
  for (const chapter of chapters) {
    splitChapters.push(...splitChapterOnHeadings(chapter));
  }

  return { title, chapters: splitChapters, resources };
```

**Step 6: Run full test suite**

Run: `bun run test:run`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/lib/epubChapterSplit.ts src/lib/epubChapterSplit.test.ts src/lib/epubParser.ts
git commit -m "feat: split monolithic EPUB chapters at heading boundaries"
```

---

### Task 4: Pagination with CSS Columns

**Files:**
- Modify: `src/index.css:3404-3414` (add paged variant)
- Modify: `src/components/EpubReader.tsx` (pagination state, page turn handlers, controls)
- Modify: `src/hooks/useEpubReader.ts` (viewMode state)

**Step 1: Add pagination CSS**

Add after the `.epub-content` block in `src/index.css`:

```css
.epub-content.paged {
  overflow: hidden;
  column-fill: auto;
  column-gap: 0;
}

.epub-content.paged > * {
  break-inside: avoid-column;
}
```

Note: The `.epub-content.paged` rule will have its `height` and `column-width` set dynamically via inline style (computed from available viewport height minus toolbar/controls).

**Step 2: Add viewMode to useEpubReader**

In `src/hooks/useEpubReader.ts`:

1. Add `viewMode` state: `'paged' | 'scroll'`, default `'paged'`
2. Persist to localStorage key `'reader:epub-view-mode'`
3. Expose `viewMode` and `setViewMode` in the result interface

Add state:
```typescript
export type EpubViewMode = 'paged' | 'scroll';

// Inside useEpubReader():
const [viewMode, setViewMode] = useState<EpubViewMode>(() => {
  const saved = localStorage.getItem('reader:epub-view-mode');
  return saved === 'scroll' ? 'scroll' : 'paged';
});

// Persist on change
useEffect(() => {
  localStorage.setItem('reader:epub-view-mode', viewMode);
}, [viewMode]);
```

Add to the return object:
```typescript
viewMode,
setViewMode,
```

Update `UseEpubReaderResult` interface to include:
```typescript
viewMode: EpubViewMode;
setViewMode: (mode: EpubViewMode) => void;
```

**Step 3: Add pagination logic to EpubReader**

In `src/components/EpubReader.tsx`, add:

1. State for `currentPage` (0-indexed) and `totalPages`
2. A `containerRef` on the parent of `epub-content` to measure available height
3. After render, compute `totalPages = Math.max(1, Math.round(scrollWidth / clientWidth))`
4. Apply `translateX(-${currentPage * clientWidth}px)` to shift pages
5. Reset `currentPage` to 0 on chapter change

Page measurement (in a `useEffect` after annotatedHtml changes):
```typescript
const [currentPage, setCurrentPage] = useState(0);
const [totalPages, setTotalPages] = useState(1);
const isPaged = epub.viewMode === 'paged';

// Measure pages after content renders
useEffect(() => {
  if (!isPaged || !contentRef.current) return;
  const el = contentRef.current;
  const pages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth));
  setTotalPages(pages);
  setCurrentPage(0);
}, [isPaged, epub.annotatedHtml]);
```

Page turn handlers:
```typescript
const goToPage = useCallback((page: number) => {
  const clamped = Math.max(0, Math.min(page, totalPages - 1));
  setCurrentPage(clamped);
  if (contentRef.current) {
    contentRef.current.scrollTo({ left: clamped * contentRef.current.clientWidth, behavior: 'instant' });
  }
}, [totalPages]);

const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
```

**Step 4: Add keyboard, click, and swipe handlers**

Keyboard (left/right arrows) — in a `useEffect`:
```typescript
useEffect(() => {
  if (!isPaged) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { nextPage(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { prevPage(); e.preventDefault(); }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [isPaged, nextPage, prevPage]);
```

Click zones — on the content div's `onClick`:
```typescript
const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  if (!isPaged) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const third = rect.width / 3;
  if (x < third) prevPage();
  else if (x > third * 2) nextPage();
}, [isPaged, prevPage, nextPage]);
```

Touch swipe — using `onTouchStart`/`onTouchEnd`:
```typescript
const touchStartRef = useRef<number | null>(null);

const handleTouchStart = useCallback((e: React.TouchEvent) => {
  touchStartRef.current = e.touches[0].clientX;
}, []);

const handleTouchEnd = useCallback((e: React.TouchEvent) => {
  if (touchStartRef.current === null) return;
  const delta = e.changedTouches[0].clientX - touchStartRef.current;
  touchStartRef.current = null;
  if (Math.abs(delta) < 50) return; // minimum swipe distance
  if (delta < 0) nextPage();
  else prevPage();
}, [nextPage, prevPage]);
```

**Step 5: Update the content div rendering**

```tsx
<div
  ref={contentRef}
  className={`epub-content${isPaged ? ' paged' : ''}`}
  style={isPaged ? {
    height: `${contentHeight}px`,
    columnWidth: `${contentWidth}px`,
  } : undefined}
  onClick={handleContentClick}
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
  dangerouslySetInnerHTML={{ __html: annotatedHtml }}
/>
```

Where `contentHeight` and `contentWidth` are measured from the available space (container height minus toolbar and controls). Use a `ResizeObserver` on the epub-reader container to keep these up to date.

**Step 6: Add view mode toggle and page indicator to controls**

In the `.epub-controls` section, update the position indicator:
- In paged mode: show `Page X / Y` and chapter indicator
- In scroll mode: show `Chapter X / Y` as currently

Add a toggle button in `.epub-mode-controls`:
```tsx
<button
  className="control-btn"
  onClick={() => epub.setViewMode(epub.viewMode === 'paged' ? 'scroll' : 'paged')}
>
  {epub.viewMode === 'paged' ? 'Scroll' : 'Paged'}
</button>
```

**Step 7: Run lint and tests**

Run: `bun run lint && bun run test:run`
Expected: All pass.

**Step 8: Commit**

```bash
git add src/index.css src/components/EpubReader.tsx src/hooks/useEpubReader.ts
git commit -m "feat: add paginated view mode for EPUB reader with keyboard/click/swipe navigation"
```

---

### Task 5: Sweep Bar Pacer

**Files:**
- Modify: `src/hooks/useEpubPacer.ts` (replace word-index timer with line-based sweep)
- Modify: `src/components/EpubReader.tsx` (sweep bar rendering, remove word-highlight logic)
- Modify: `src/index.css` (add epub sweep bar styles)

**Step 1: Create a `useEpubLineSweep` hook**

This hook replaces `useEpubPacer`. It:
1. Takes a `contentRef` to the `.epub-content` div
2. Groups word spans by their `offsetTop` into lines
3. Computes line durations: `(charCount / 5) * (60000 / wpm)`
4. Manages `currentLineIndex`, injects a `<style>` with `@keyframes` per line, and inserts a sweep `<span>` before the first word of the current line
5. Auto-advances lines when animation completes (via `animationend` event)
6. Auto-scrolls to keep current line visible

New file `src/hooks/useEpubLineSweep.ts`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';

interface LineInfo {
  startIdx: number;
  endIdx: number;
  charCount: number;
  offsetTop: number;
  leftPx: number;
  widthCh: number;
}

export interface UseEpubLineSweepOptions {
  contentRef: React.RefObject<HTMLDivElement | null>;
  wordCount: number;
  wpm: number;
  enabled: boolean;
}

export interface UseEpubLineSweepResult {
  currentLineIndex: number;
  totalLines: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

/**
 * Group word spans in the contentRef by their offsetTop into lines.
 * Returns line info with character counts for sweep duration calculation.
 */
function computeLines(container: HTMLElement): LineInfo[] {
  const spans = container.querySelectorAll<HTMLElement>('[data-word-idx]');
  if (spans.length === 0) return [];

  const lines: LineInfo[] = [];
  let currentTop = -1;
  let lineStart = 0;
  let lineChars = 0;
  let lineLeft = 0;

  spans.forEach((span, i) => {
    const top = span.offsetTop;
    const idx = parseInt(span.getAttribute('data-word-idx') || '0', 10);
    const chars = (span.textContent || '').length;

    if (i === 0 || Math.abs(top - currentTop) > 2) {
      // New line
      if (i > 0) {
        const prevSpan = spans[i - 1];
        const widthPx = (prevSpan.offsetLeft + prevSpan.offsetWidth) - lineLeft;
        // Approximate ch width from first span
        const chWidth = spans[0].offsetWidth / Math.max(1, (spans[0].textContent || '').length);
        lines.push({
          startIdx: lineStart,
          endIdx: idx - 1,
          charCount: lineChars,
          offsetTop: currentTop,
          leftPx: lineLeft,
          widthCh: Math.round(widthPx / chWidth),
        });
      }
      currentTop = top;
      lineStart = idx;
      lineChars = chars;
      lineLeft = span.offsetLeft;
    } else {
      lineChars += chars + 1; // +1 for space between words
    }
  });

  // Flush last line
  if (spans.length > 0) {
    const lastSpan = spans[spans.length - 1];
    const widthPx = (lastSpan.offsetLeft + lastSpan.offsetWidth) - lineLeft;
    const chWidth = spans[0].offsetWidth / Math.max(1, (spans[0].textContent || '').length);
    lines.push({
      startIdx: lineStart,
      endIdx: parseInt(lastSpan.getAttribute('data-word-idx') || '0', 10),
      charCount: lineChars,
      offsetTop: currentTop,
      leftPx: lineLeft,
      widthCh: Math.round(widthPx / chWidth),
    });
  }

  return lines;
}
```

The hook manages play/pause state, injects a sweep `<span class="epub-sweep">` absolutely positioned over the current line, and uses CSS `@keyframes` animation identical to GuidedReader:

```css
@keyframes epub-sweep-N { from { width: 0ch; } to { width: Xch; } }
```

Duration = `(line.charCount / 5) * (60000 / wpm)`.

On `animationend`, advance to next line. On last line end, stop playback.

**Step 2: Add epub sweep CSS**

In `src/index.css`, add after the existing `.epub-word-highlight` block:

```css
.epub-sweep-line {
  position: relative;
}

.epub-sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  background: var(--guided-sweep-color);
  pointer-events: none;
}
```

**Step 3: Update EpubReader to use sweep instead of word highlight**

In `src/components/EpubReader.tsx`:
1. Replace the `useEpubPacer` import with `useEpubLineSweep`
2. Remove the word-highlight `useEffect` (lines 68-96)
3. The sweep hook manages its own DOM manipulation (adding/removing sweep elements and keyframe styles)
4. Keep the pacer controls (play/pause, WPM adjustment) — wire them to the sweep hook's `toggle`/`isPlaying`

**Step 4: Remove old word-highlight CSS**

The `.epub-word-highlight` class in `src/index.css:3482-3485` can be removed (no longer used).

**Step 5: Run lint and tests**

Run: `bun run lint && bun run test:run`
Expected: Pass. (The `useEpubPacer.test.ts` tests will need updating or replacement since the hook is being replaced.)

**Step 6: Commit**

```bash
git add src/hooks/useEpubLineSweep.ts src/hooks/useEpubPacer.ts src/components/EpubReader.tsx src/index.css
git commit -m "feat: replace word-highlight pacer with line sweep bar in EPUB reader"
```

---

### Task 6: Character-Level Generation Masking

**Files:**
- Modify: `src/lib/epubGenerationMask.ts` (replace whole-word masking with character-level)
- Modify: `src/components/EpubReader.tsx` (render character-level masks in DOM)
- Modify: `src/lib/epubGenerationMask.test.ts`

**Step 1: Replace `selectMaskedWords` with character-level masking**

The current `epubGenerationMask.ts` selects whole word indices. Replace it with a function that takes a word and returns a masked string (using `_` for masked characters), reusing the logic from `generationMask.ts`'s `maskGenerationLine`.

New function signature:
```typescript
/**
 * Mask characters within a single word for generation mode.
 * Returns the word with some characters replaced by '_'.
 * Skips function words, proper nouns, digits, acronyms.
 */
export function maskWordCharacters(
  word: string,
  difficulty: GenerationDifficulty,
  seed: string,
): string
```

This wraps the core masking from `generationMask.ts` — specifically `maskCoreWordByProfile` with the appropriate difficulty profile. Import and reuse the existing `maskGenerationLine` or extract the needed helpers.

Actually, the simplest approach: call `maskGenerationLine(word, difficulty, seedNum, 0)` on each word. This handles all the eligibility checks (function words, proper nouns, etc.) and returns the masked string. The word list from the annotator gives us individual words, and `maskGenerationLine` works on a "line" which can be a single word.

New `epubGenerationMask.ts`:
```typescript
import type { GenerationDifficulty } from '../types';
import { maskGenerationLine } from './generationMask';

/**
 * Mask characters within words for EPUB generation mode.
 * Returns an array of masked word strings (same length as input).
 * Masked characters are replaced with '_'.
 */
export function maskEpubWords(
  words: string[],
  difficulty: GenerationDifficulty,
  seed: number,
): string[] {
  return words.map((word, i) =>
    maskGenerationLine(word, difficulty, seed, i)
  );
}
```

**Step 2: Update generation mode rendering in EpubReader**

In `src/components/EpubReader.tsx`, the generation mode effect needs to:
1. For each word span, get the masked version from `maskEpubWords`
2. If the masked word differs from the original (has `_` chars), replace the span's innerHTML with per-character `<span>` elements:
   - Regular characters: `<span class="generation-grid-cell">X</span>`
   - Masked characters (`_`): `<span class="generation-grid-cell generation-mask-slot"></span>`
3. When `revealed`, replace mask slots with the original character + `revealed` class
4. On mode exit, restore original word text content

Update the generation masking effect:
```typescript
// Compute masked words (character-level)
const maskedWords = useMemo(() => {
  if (!isGenerationMode || epub.words.length === 0) return [];
  return maskEpubWords(epub.words, generationDifficulty, maskSeed);
}, [isGenerationMode, epub.words, generationDifficulty, maskSeed]);

// Apply character-level masking to DOM
useEffect(() => {
  if (!contentRef.current) return;
  const container = contentRef.current;

  if (!isGenerationMode || maskedWords.length === 0) {
    // Restore original text when leaving generation mode
    const allCells = container.querySelectorAll('.generation-grid-cell');
    if (allCells.length > 0) {
      // Need to restore — find word spans and reset their content
      epub.words.forEach((word, idx) => {
        const span = container.querySelector(`[data-word-idx="${idx}"]`);
        if (span) span.textContent = word;
      });
    }
    return;
  }

  maskedWords.forEach((masked, idx) => {
    const span = container.querySelector(`[data-word-idx="${idx}"]`);
    if (!span) return;

    const original = epub.words[idx];
    if (masked === original) {
      // No masking needed — ensure plain text
      span.textContent = original;
      return;
    }

    // Build character-level spans
    span.textContent = '';
    for (let c = 0; c < masked.length; c++) {
      const charSpan = document.createElement('span');
      if (masked[c] === '_') {
        charSpan.className = 'generation-grid-cell generation-mask-slot';
        if (revealed) {
          charSpan.className = 'generation-grid-cell generation-mask-slot revealed';
          charSpan.textContent = original[c];
        }
      } else {
        charSpan.className = 'generation-grid-cell';
        charSpan.textContent = masked[c];
      }
      span.appendChild(charSpan);
    }
  });
}, [isGenerationMode, maskedWords, revealed, epub.words]);
```

**Step 3: Add revealed styling for mask slots**

In `src/index.css`, add after the existing `.generation-mask-slot::after` block:

```css
.epub-content .generation-mask-slot.revealed {
  color: var(--accent);
}

.epub-content .generation-mask-slot.revealed::after {
  display: none;
}
```

**Step 4: Remove old whole-word masking CSS**

Remove `.epub-word-masked` and `.epub-word-masked.revealed` from `src/index.css:3487-3497`.

**Step 5: Update tests**

Update `src/lib/epubGenerationMask.test.ts` to test `maskEpubWords` instead of `selectMaskedWords`:

```typescript
import { describe, it, expect } from 'vitest';
import { maskEpubWords } from './epubGenerationMask';

describe('maskEpubWords', () => {
  it('returns masked strings with _ for masked characters', () => {
    const words = ['philosophy', 'the', 'understanding'];
    const result = maskEpubWords(words, 'normal', 42);
    expect(result).toHaveLength(3);
    // Function word 'the' should be unchanged
    expect(result[1]).toBe('the');
    // Content words may have _ characters
    for (const masked of [result[0], result[2]]) {
      expect(masked.length).toBe(words[words.indexOf(masked) === -1 ? 0 : words.indexOf(masked)].length || masked.length);
    }
  });

  it('preserves word lengths', () => {
    const words = ['hello', 'world', 'test'];
    const result = maskEpubWords(words, 'hard', 99);
    result.forEach((masked, i) => {
      expect(masked.length).toBe(words[i].length);
    });
  });

  it('masks more aggressively at higher difficulty', () => {
    const words = ['philosophy', 'understanding', 'remarkable', 'extraordinary'];
    const normal = maskEpubWords(words, 'normal', 42);
    const hard = maskEpubWords(words, 'hard', 42);
    const recall = maskEpubWords(words, 'recall', 42);

    const countMasks = (arr: string[]) => arr.join('').split('').filter(c => c === '_').length;
    expect(countMasks(hard)).toBeGreaterThanOrEqual(countMasks(normal));
    expect(countMasks(recall)).toBeGreaterThanOrEqual(countMasks(hard));
  });

  it('is deterministic for same seed', () => {
    const words = ['philosophy', 'understanding'];
    const a = maskEpubWords(words, 'normal', 42);
    const b = maskEpubWords(words, 'normal', 42);
    expect(a).toEqual(b);
  });
});
```

**Step 6: Run lint and tests**

Run: `bun run lint && bun run test:run`
Expected: Pass.

**Step 7: Commit**

```bash
git add src/lib/epubGenerationMask.ts src/lib/epubGenerationMask.test.ts src/components/EpubReader.tsx src/index.css
git commit -m "feat: character-level generation masking for EPUB reader"
```

---

### Task 7: Final Integration and Cleanup

**Files:**
- Modify: `src/hooks/useEpubPacer.ts` (delete if fully replaced)
- Modify: `src/hooks/useEpubPacer.test.ts` (delete or update)
- All files

**Step 1: Remove dead code**

- Delete `useEpubPacer.ts` and `useEpubPacer.test.ts` if the sweep hook fully replaces them
- Remove any unused imports in EpubReader.tsx

**Step 2: Run full verification**

Run: `bun run verify`
Expected: lint + tests + build all pass.

**Step 3: Visual verification checklist**

Open each EPUB and verify:
- [ ] Cover image properly sized and centered
- [ ] All text renders in monospace
- [ ] Paged view is default — content fills viewport height, no scroll
- [ ] Left/right arrow keys turn pages
- [ ] Click left-third/right-third turns pages
- [ ] Swipe left/right turns pages
- [ ] "Scroll" toggle switches to scroll mode
- [ ] Chapter navigation (Prev/Next) works
- [ ] TOC shows split chapters for monolithic EPUBs
- [ ] Pacer mode: sweep bar moves across lines at WPM speed
- [ ] Pacer mode: auto-scrolls/advances pages to keep sweep visible
- [ ] Generation mode: characters masked with underlines, not whole words
- [ ] Generation mode: Reveal button shows masked characters
- [ ] Generation difficulty levels work (Normal/Hard/Recall)

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up dead EPUB pacer code after sweep bar migration"
```
