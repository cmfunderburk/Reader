# Reader Vision (2026)

## Purpose

Reader is a reading training application.

The project vision is now centered on two complementary experiences:

1. A comprehensive reading trainer (primary focus, already largely implemented)
2. A low-pressure daily digest for breadth practice (secondary, still evolving)

This direction prioritizes practical training value over broader "all-in-one learning OS" scope.

## Current Product Vision (Implemented)

Reader today is a multi-mode trainer for reading mechanics and comprehension pressure:

1. **RSVP** for rapid intake and pacing control
2. **Saccade** for natural full-line reading at controlled speed
3. **Prediction** for anticipatory processing and flow-state calibration
4. **Recall** for high-fidelity reconstruction from first-letter scaffolds
5. **Training** for adaptive read-recall-adjust loops
6. **Random Drill** for pseudo-random unfamiliar material practice using corpus-backed content

Supporting capabilities already in place:

1. Content ingestion from URL, paste, feeds, and local files (Electron)
2. Persistent settings and per-article progress
3. Persisted training/drill state across sessions
4. Corpus tiering and random sampling integration for drill workflows

## Forward-Looking Vision

### Track A: Trainer Completion and Polish (Near-Term Priority)

Goal: make Reader a fully rounded trainer across speed, comprehension, and retention.

Planned emphasis:

1. Polish and smooth UX consistency across all current modes
2. Add at least one comprehension check that is **not** exact word-for-word recall
3. Keep training feedback actionable and fast to interpret

Direction for the new comprehension mode:

1. Measure structural understanding (claims, key ideas, relationships), not verbatim reconstruction
2. Complement existing Recall mode rather than replacing it
3. Start with deterministic scoring heuristics before considering LLM scoring

### Track B: Daily Digest Experience (Exploratory but Concrete)

Goal: provide stress-free, horizon-broadening reading sessions in Saccade mode.

Core concept:

1. Serve interesting pseudo-random passages from curated corpora
2. Default session budget: content sized to approximately 10 minutes at user-selected WPM
3. Emphasize novelty and variety over strict curriculum

Initial corpus direction:

1. Wikipedia Good/Featured-style content (already aligned with existing corpus work)
2. Optional additions such as short fiction/public-domain prose (for example, Project Gutenberg selections)

Design constraints:

1. Lightweight entry: select session and read immediately
2. Natural reading feel: Saccade-first presentation
3. Low cognitive pressure by default, with optional post-read checks later

## Scope Boundaries

In scope now:

1. Reading training quality
2. Comprehension-mode expansion within reader workflows
3. Digest curation and delivery for regular practice

Out of scope for this phase (unless explicitly reprioritized):

1. Full LLM deep-dialogue integration as a core product pillar
2. Full spaced-repetition reviewer subsystem migration
3. Large architecture rewrites not required by trainer/digest goals

## Product Principles

1. **Training first**: every major feature should improve real reading performance
2. **Low friction**: entering a useful session should take seconds, not setup overhead
3. **Evidence over novelty**: prefer measurable behavior improvements over feature surface area
4. **Calm consistency**: modes should feel like one coherent system, not separate tools

## Success Signals

Trainer success signals:

1. Users can sustain higher WPM without regressions in comprehension measures
2. Mode transitions and workflows feel reliable and predictable
3. New comprehension mode adds signal beyond current word-level recall metrics

Digest success signals:

1. Users complete short daily sessions consistently
2. Served content feels varied and worthwhile
3. Session sizing (time vs WPM) is accurate enough to trust

