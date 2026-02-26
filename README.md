# Reader

An eBook reader with built-in pacing, recall training, and comprehension tools.

## What This Is

This project started as a quick RSVP speed-reading demo — the kind of thing you build in an afternoon with a coding agent. Then I kept following other miscellaneous ideas: saccade pacers, recall exercises, prediction drills, generation-effect masking, comprehension checks. Somewhere along the way it became an actual reader.

Today it handles EPUBs, PDFs, web articles, RSS feeds, and pasted text. You can read normally with a sweep pacer guiding your eyes, or switch into modes designed around specific research ideas — RSVP for forced pacing, generation masking for re-reading benefit (some evidence suggests that requiring partial recall during re-reads produces better retention than pure recognition), prediction and recall for verbatim memorization. After reading, you can run LLM-generated comprehension checks, and missed questions feed into a lightweight Leitner SRS for spaced review.

The goal is simple: reduce friction between reading and practicing. Pacing, controls, and context stay consistent whether you're reading a chapter, drilling a sentence, or reviewing flashcards.

## Desktop & Mobile

The **Electron build** is the primary desktop experience — it provides a local EPUB/PDF library with file management. The **web build** works in any browser and covers everything except local file handling.

For mobile, serve the web build over Tailscale to access it from a phone or tablet without exposing a public port:

```bash
bun run build
npx serve dist --listen 3000
tailscale serve 3000
# open https://<host>.<tailnet>.ts.net/ on the mobile device
# tailscale serve reset   to stop sharing
```

## Reading Modes

**Saccade** — full-page reading with a sweep or focus pacer, OVP/fixation guidance, and configurable saccade length. The default way to read.

**RSVP** — rapid serial visual presentation, one word or chunk at a time with ORP highlighting. Good for forced-pace training at a target WPM.

**Generation** — line-paced reading with selective letter masking. Inspired by generation-effect research: during re-reads, having to reconstruct partially masked words may improve retention over passive recognition. Three difficulty presets control how aggressively letters are hidden.

## Practice & Training

**Prediction** — next-word prediction with typo-tolerant scoring. Tests whether you can anticipate a text's language.

**Recall** — word-by-word reconstruction of saved passages, with optional first-letter scaffolding.

**Training** — a read → recall → feedback loop over article paragraphs or random drill sentences. Random Drill pulls from Wikipedia and prose corpora across readability tiers, with optional auto-adjusting WPM difficulty.

## Comprehension Checks & Review

LLM-generated question sets (via Gemini API) test passage understanding in closed-book then open-book sequence. Mixed formats: multiple choice, true/false, short answer, essay. Results include per-question explanatory feedback.

Scored questions are automatically ingested into a Leitner-box SRS system (5 boxes, 1–30 day intervals) for spaced review from the home screen.

## Content Sources

- URL import (Readability extraction)
- Pasted text
- RSS/Atom feeds
- EPUB and PDF files (Electron)
- Wikipedia daily/random featured articles

## Development

```bash
bun install
bun run dev              # web dev server (127.0.0.1:5417)
bun run electron:dev     # Electron dev
bun run build            # production web build
bun run electron:build   # Electron package
```

Override the dev port with `READER_DEV_PORT=5517 bun run dev`.

## Quality Gates

```bash
bun run verify           # typecheck + lint + test
bun run verify:ci        # CI gate (lint + coverage + build)
```

Also run `bun run electron:build` when `electron/**` or shared Electron types change.

## Project Docs

- Agent/repo workflow: `AGENTS.md`
- AI implementation context: `CLAUDE.md`
- Comprehension research synthesis: `docs/Comprehension-Check-Research.md`
- Comprehension milestone board: `docs/Comprehension-Improvement-Milestone-Board.md`
