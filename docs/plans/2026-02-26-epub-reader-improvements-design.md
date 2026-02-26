# EPUB Reader Improvements Design

Date: 2026-02-26

## Problem

The EPUB reader has several issues after the initial spine fix:
1. Cover/front images overflow and display poorly (no height constraint)
2. No pagination — content is a single scroll, not paged
3. Monolithic EPUBs (e.g. Gutenberg) have no meaningful chapter splits
4. Pacer mode highlights individual words instead of sweeping a bar across lines
5. Generation mode masks whole words instead of individual characters

## Design Decisions

- **Monospace font only** for all EPUB content — matches existing guided reader, enables `ch`-unit sweep bar and character-level masking without text extraction or view switching.
- **Paged view default** with scroll toggle — CSS columns create pages, `translateX` navigates.
- **Chapter splitting on headings** — monolithic spine items split at h1/h2/h3 boundaries in the parser.
- **Swipe + click + keyboard** page turns.

## Changes

### 1. Image Display Fix

Add to `.epub-content img` CSS:
- `max-height: 80vh`
- `object-fit: contain`
- `display: block; margin: 0 auto` for centering

### 2. Monospace Font

Set `.epub-content` font to `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace`.
Override any EPUB-embedded font declarations with `font-family: inherit !important` on all text elements within `.epub-content`.

### 3. Pagination (CSS Columns)

**Layout:**
- `.epub-content.paged`: `column-width` fills viewport, `height` fixed to available space, `overflow: hidden`
- Page navigation via `translateX(-${page * pageWidth}px)` on inner wrapper
- Total pages computed from `scrollWidth / clientWidth` after render

**Controls:**
- Left/right arrow keys turn pages
- Click left-third / right-third of content area
- Touch swipe left/right (touchstart/touchend delta)
- Toggle button switches between paged and scroll view modes
- Persist view mode preference in localStorage

**State:** `currentPage` and `totalPages` tracked per chapter, reset on chapter change.

### 4. Chapter Splitting

In `epubParser.ts`, after loading a spine section's HTML:
1. Parse into DOM
2. Walk top-level body children
3. On encountering h1/h2/h3, start a new virtual chapter
4. Content before first heading → first chapter (or skip if empty whitespace)
5. Each split chapter titled from its heading text
6. Only split if section contains 2+ headings (single-heading sections left as-is)

### 5. Pacer Sweep Bar

Replace word-highlight pacer with line-sweeping bar:
- On entering pacer mode, compute line layout from word span positions (group spans by `offsetTop`)
- For each line, create/animate a sweep `<span>` with CSS `@keyframes` from `width: 0` to `width: ${lineWidthCh}ch`
- Duration per line: `(charCount / 5) * (60000 / wpm)` matching GuidedReader
- Auto-advance to next line when animation completes
- Auto-scroll to keep current line visible
- Reuse existing `.guided-sweep` CSS class and `--guided-sweep-color` variable

### 6. Generation Character-Level Masking

Replace whole-word masking with per-character masking:
- In annotated HTML, each word span's text content gets split into individual `<span class="generation-grid-cell">` elements (1ch wide each)
- Masked characters replaced with `<span class="generation-mask-slot">` (underline via `::after`)
- Use existing `generationMask.ts` masking logic (skip first/last letter, non-consecutive selection)
- Sweep-reveal: as pacer sweep passes, masked characters progressively revealed
- Reuse existing `.generation-grid-cell`, `.generation-mask-slot` CSS classes

## Files Modified

- `src/index.css` — image fix, monospace font, pagination CSS, reuse guided-reader CSS vars
- `src/lib/epubParser.ts` — chapter splitting logic
- `src/components/EpubReader.tsx` — pagination state/controls, page turn handlers, updated pacer/generation rendering
- `src/hooks/useEpubReader.ts` — view mode state, page tracking
- `src/hooks/useEpubPacer.ts` — replace word-index timer with line-sweep animation driver
- `src/lib/epubGenerationMask.ts` — character-level masking (reuse generationMask.ts logic)
- `src/lib/htmlAnnotator.ts` — optional: character-level span wrapping for generation mode
