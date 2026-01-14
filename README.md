# SpeedRead

An RSVP (Rapid Serial Visual Presentation) speed reading application. Read articles, PDFs, and EPUBs at 400+ words per minute by displaying text one word or phrase at a time.

## Features

- **RSVP Reader**: Display text word-by-word or phrase-by-phrase at configurable speeds (100-1000 WPM)
- **Multiple Input Sources**:
  - Paste text or URLs directly
  - Add RSS feeds for article queues
  - Load local PDFs and EPUBs (Electron app)
- **Reading Modes**: Single word, short phrases (~15 chars), or longer phrases (~25 chars)
- **Smart Chunking**: Respects sentence boundaries and punctuation for natural reading flow
- **Progress Tracking**: Visual progress bar and chunk counter
- **Keyboard Controls**: Full keyboard navigation for hands-free reading

## Installation

```bash
npm install
```

## Usage

### Web Version

```bash
npm run dev
```

Opens at http://localhost:5173. Supports URL fetching, RSS feeds, and pasted text.

### Electron Version (Local Files)

```bash
npm run electron:dev
```

Adds support for reading local PDF and EPUB files from configured library directories.

## Controls

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| Left Arrow | Previous chunk |
| Right Arrow | Next chunk |
| Up Arrow | Increase speed |
| Down Arrow | Decrease speed |

## Building

```bash
# Web build
npm run build

# Electron build (creates distributable)
npm run electron:build
```

## Library Configuration (Electron)

Click the gear icon next to "Library" to add or remove library directories. The app scans directories recursively for PDF and EPUB files.

Default directories on first run:
- Classics (EPUBs)
- Articles (PDFs)
- References (PDFs)

## Architecture

```
src/                    # React frontend
  components/
    App.tsx             # Main application
    RSVPReader.tsx      # Speed reading display
    ArticleQueue.tsx    # Reading queue management
    Library.tsx         # Local file browser (Electron)
  lib/
    chunker.ts          # Text chunking algorithms

electron/               # Electron main process
  main.ts               # Window management, IPC handlers
  preload.ts            # Context bridge for renderer
  lib/
    pdf.ts              # PDF text extraction
    epub.ts             # EPUB text extraction
    library.ts          # Directory scanning
```

## Tech Stack

- React 18
- TypeScript
- Vite
- Electron (optional, for local file access)
- pdf-parse (PDF extraction)
- epub (EPUB extraction)
- Mozilla Readability (web article extraction)

---

# User's Guide

## Getting Started

1. **Launch the app** with `npm run electron:dev` (for local files) or `npm run dev` (web only)
2. **Add content** using one of the methods below
3. **Click Play** or press Space to start reading
4. **Adjust speed** with the dropdown or arrow keys

## Adding Content

### From the Library (Electron only)

1. Select a library source tab (Classics, Articles, References)
2. Click any PDF or EPUB file to load it
3. The file appears in your Reading Queue

### From a URL

1. Click "+ Add URL" in the Reading Queue
2. Paste an article URL
3. The app extracts readable content automatically

### From RSS Feeds

1. Click "+ Add Feed" in RSS Feeds
2. Enter an RSS feed URL
3. Articles appear in the feed list - click to add to queue

### Paste Text

1. Click "+ Add URL"
2. Paste plain text directly instead of a URL

## Reading

### Display Modes

- **Word**: Shows one word at a time. Best for maximum speed.
- **Phrase (~15ch)**: Shows 2-3 words. Balances speed and context.
- **Phrase (~25ch)**: Shows 3-5 words. More natural reading rhythm.

### Speed Settings

- Start at 300-400 WPM if you're new to RSVP
- Work up gradually - 600+ WPM is achievable with practice
- Use arrow keys to adjust on the fly

### Navigation

- **Space**: Play/Pause at any time
- **Left/Right arrows**: Step through manually when paused
- **Progress bar**: Shows position in the article

## Tips for Effective Speed Reading

1. **Minimize subvocalization**: Try not to "say" words in your head
2. **Trust your brain**: You're absorbing more than you think
3. **Take breaks**: RSVP is intense - rest your eyes periodically
4. **Start with familiar content**: Practice with easy material first
5. **Use phrase mode**: It's often faster than single words despite showing more text

## Managing Your Library (Electron)

Click the gear icon (settings) next to "Library" to:

- **Add directories**: Click "Add Directory" and select a folder
- **Remove directories**: Click the X next to any source
- **Rename sources**: Sources use the folder name by default

The app scans recursively, so subdirectories are included automatically.
