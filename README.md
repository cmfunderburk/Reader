# Reader

A reading training application. Load articles, books, and feeds, then practice with four modes designed to build different reading skills — from raw speed to deep comprehension and recall.

## Reading Modes

### RSVP

Rapid Serial Visual Presentation. Words or short phrases are displayed one at a time at the center of the screen, with the optimal recognition point (ORP) highlighted. This trains fast intake by eliminating eye movement overhead.

- **Chunking modes**: single word, phrase (~10 chars), clause (~40 chars), or custom width
- Respects sentence boundaries and punctuation
- Configurable WPM (100-800)

### Saccade

Full-page reading with a sweep pacer. Text is laid out in fixed-width lines (80 chars) across configurable pages. A visual sweep animates across each line at your target WPM, training your eyes to move at a steady pace through natural text.

- Toggle the pacer on/off (manual page turning when off)
- Preserves headings and paragraph structure
- Configurable lines per page (5-30)

### Prediction

Next-word prediction training. You see the text accumulated so far and type what you think comes next. Correct guesses advance instantly (flow state); misses pause and show the actual word with a loss score.

- First-letter hint for the current word
- Levenshtein-based scoring (0 = exact match, 1 = completely wrong)
- Tab to preview ahead at your selected WPM, then resume predicting
- Session stats: words attempted, exact match %, average loss

### Recall

First-letter scaffold reconstruction. Each word shows only its first letter with the rest replaced by a dotted underline showing character positions. You type to reconstruct each word from memory and context.

- Words validate as you type and advance automatically
- Correct words appear in green, misses in red
- Uses saccade page layout for stable line positioning
- Session stats tracked the same as prediction mode

## Adding Content

**From a URL** — Click "+ Add URL" and paste an article link. The app extracts readable content automatically using Mozilla Readability.

**Paste text** — In the same dialog, paste plain text directly.

**RSS/Atom feeds** — Add feed URLs in the Feeds panel. Articles appear in the feed list; click to add them to your reading queue.

**Local files (Electron only)** — Configure library directories in Library Settings. The app scans recursively for PDF and EPUB files.

## Controls

### Playback (RSVP / Saccade)

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | Previous chunk |
| Right Arrow | Next chunk |
| `[` | Decrease WPM by 10 |
| `]` | Increase WPM by 10 |
| Escape | Pause / exit current view |

### Prediction Mode

| Key | Action |
|-----|--------|
| Space / Enter | Submit prediction |
| Tab | Toggle preview (when input focused or previewing) |
| `` ` `` | Reset to beginning |

### Recall Mode

Type to fill in each word. Words auto-advance on correct input.

## Settings

Click the gear icon in the header to configure:

- **Font sizes** for RSVP, saccade, and prediction modes (independent sliders)
- **Prediction line width** — narrow (50ch), medium (65ch), or wide (85ch)

Reader controls at the bottom of the main view provide:

- **WPM slider** (100-800)
- **Display mode** selector (RSVP / Saccade / Prediction / Recall)
- **Chunking mode** selector (Word / Phrase / Clause / Custom)
- **Lines per page** for saccade and recall modes
- **Pacer toggle** for saccade mode

## Running

```bash
# Install dependencies
npm install

# Web version (localhost:5173)
npm run dev

# Electron version (adds local PDF/EPUB support)
npm run electron:dev

# Run tests
npm test

# Production build (web)
npm run build

# Production build (Electron distributable)
npm run electron:build
```
