# EPUB Reader & Release Readiness Design

**Date**: 2026-02-25
**Status**: Approved

## Goals

1. **Primary**: Native EPUB reading with reading enhancements (sweep pacer, generation masking) applied directly to rich formatted content.
2. **Secondary**: Desktop packaging polish (auto-updates, smaller bundles).
3. **Deferred**: Mobile app (iOS/Android), PWA.

## Design Decisions

### EPUB Integration Model

EPUB is a **content source**, not a new activity type. When an EPUB is loaded, the app gains a "book context" — the user can navigate chapters, read rich content, and apply reading enhancements directly to the formatted text.

Non-EPUB content (URL, paste, RSS feeds) continues to work exactly as today.

### Reading Enhancements on Rich EPUB Content

| Enhancement | In EPUB reader? | Notes |
|-------------|-----------------|-------|
| Sweep pacer | Yes | Moving highlight at WPM through rich formatted text |
| Generation masking | Yes | Words masked inline in rich EPUB HTML |
| Saccade ORPs | No | Training-only mode (renamed to "Guided") |
| RSVP | No | Training-only mode for visual processing practice |

### Mode Rename

"Saccade" → **"Guided"** across the entire app. The name "saccade" is technical jargon; "Guided" describes the pacer-driven reading experience more accessibly.

### EPUB Rendering Approach

**epub.js for parsing, custom React rendering**.

- epub.js handles EPUB parsing: TOC extraction, spine ordering, metadata, chapter HTML extraction.
- epub.js does NOT render — its iframe-based rendering would block direct DOM manipulation.
- Chapter HTML is rendered in React components with word-level annotation.
- CSS from EPUBs is scoped to the reader container to prevent style leakage.
- Images and fonts are extracted as blob URLs with `src` attributes rewritten.

### Word-Level Annotation (Core Technique)

To apply reading enhancements to rich HTML:

1. Extract chapter HTML from epub.js section API.
2. Parse into DOM, walk all text nodes.
3. Split text into words, wrap each in `<span data-word-idx="N">`.
4. Render the annotated HTML in React (preserving all `<p>`, `<h1>`, `<img>`, `<em>`, etc.).
5. Target word spans by index for: pacer highlighting, generation masking.

The EPUB's formatting, images, and layout remain intact — word spans are invisible additions inside the existing HTML structure.

### Platform Support

- **Web**: EPUB files loaded via `<input type="file">` or drag-and-drop → `ArrayBuffer` → epub.js in browser.
- **Electron**: File system access via existing `window.library` API → file read → `ArrayBuffer` → epub.js in renderer process. Existing `electron/lib/epub.ts` plain-text extraction remains as a utility but is no longer the primary EPUB path.

epub.js runs entirely in the renderer/browser on both platforms.

## Architecture

### Component Structure

```
App.tsx (existing orchestrator)
├── [existing] Home / content entry (URL, paste, feeds)
├── [existing] PacedReader, RecallReader, TrainingReader
│
├── [new] EpubReader
│   ├── EpubChapterPicker    — TOC sidebar/modal for chapter selection
│   ├── EpubContent          — renders annotated chapter HTML
│   │   └── word spans       — <span data-word-idx> wrapping every word
│   ├── EpubPacer            — sweep highlight (targets word spans at WPM)
│   ├── EpubGeneration       — masks word spans, accepts input
│   └── EpubControls         — mode toggle, WPM, chapter nav, font/theme
│
├── [new] useEpubReader hook
│   ├── book loading (epub.js Book instance)
│   ├── chapter state (current chapter, HTML, word index map)
│   ├── reading mode (browse / pacer / generation)
│   ├── position tracking (chapter + word index)
│   └── word annotation engine (text node walking, span wrapping)
```

### Code Reuse from Existing Codebase

- `tokenizer.ts` — word splitting, scoring model
- `saccade.ts` — fixation logic (for pacer word targeting)
- Levenshtein scoring — generation mode input checking
- `usePlaybackTimer` — WPM timing logic for pacer
- Storage patterns — localStorage keyed by book identifier

### New Code Required

- EPUB loading and chapter extraction (epub.js integration)
- HTML text-node walker + word-wrapper (annotation engine)
- CSS scoping for EPUB stylesheets
- Blob URL management for images/fonts
- Pagination (CSS multi-column or scroll-based)
- Chapter navigation UI (TOC)
- Book state persistence

## Storage & Persistence

### Per-Book State (localStorage)

Keyed by EPUB identifier or filename hash:

```ts
interface BookState {
  title: string;
  lastChapterIndex: number;
  lastWordIndex: number;        // within chapter
  lastOpenedAt: number;         // timestamp
}
```

### Platform Differences

- **Web**: Books loaded from file picker each session (browser can't persist files). Position state persists, so user reopens the same file and resumes.
- **Electron**: File paths persist in library. App can reopen books automatically.

### No Changes to Existing Storage

Articles, settings, WPM per activity, training state, drill state — all untouched.

## Desktop Packaging (Secondary Workstream)

Independent of EPUB work:

- **Auto-updates**: `electron-updater` with GitHub Releases as update source.
- **Bundle size**: Move corpus JSONL files out of ASAR into a downloadable-on-first-run resource (~100MB reduction).
- **Code signing**: macOS notarization + Windows signing (requires certificates, can be deferred).
- **Current config**: Already targets Linux (AppImage + DEB), macOS (DMG), Windows (NSIS).

## Out of Scope

- Mobile app (iOS/Android) — deferred
- PWA / service worker — deferred
- Bookmarks / annotations / highlights — future enhancement
- Rich rendering of non-EPUB content (URLs, pasted text remain plain-text)
- RSVP or Saccade ORP in EPUB reader (training-only modes)
