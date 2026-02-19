# Reader Tauri Bridge -> Full Rust Plan

Date: 2026-02-19
Owner: `cmf` (solo)
Related: `docs/random/desktop-rewrite-options-report-2026-02-19.md`

## 1. Objective

Ship a lower-overhead desktop app quickly via Tauri while creating a forced path to a full Rust rewrite (including UI), without freezing product progress for months.

## 2. Non-Negotiable Outcomes

1. Electron is replaced by Tauri as desktop shell.
2. New domain logic is implemented in Rust only.
3. Existing TS domain logic is ported to Rust behind compatibility tests.
4. A Rust-native UI path is chosen and executed to completion.
5. React/TS renderer is removed by an explicit sunset milestone.

## 3. Guardrails (To Avoid Perma-Bridge)

1. Feature freeze for non-critical UI additions during bridge period.
2. No new business rules in `src/lib/*.ts` after Week 4.
3. Every migrated domain module gets a Rust implementation plus parity fixtures.
4. Monthly sunset checkpoint: if migration ratio is below target, cut scope or pause new features.

## 4. Scope

In scope:

- Desktop shell migration: Electron -> Tauri.
- Rust command layer for native features:
- library source management
- file dialogs
- PDF/EPUB/TXT open/extract
- secure key storage
- corpus loading and sampling
- Domain module migration (TS -> Rust), beginning with highest-stability core.
- Rust UI spike and then full UI migration.

Out of scope for first 8 weeks:

- New major product features.
- Algorithm redesign of pacing/scoring behavior.
- Data model changes that break old local data import.

## 5. Target Architecture

### 5.1 Bridge Stage (Weeks 1-8)

- UI: existing React renderer.
- Desktop shell: Tauri.
- Native services: Rust `tauri::command` endpoints replacing Electron IPC.
- Domain logic split:
- still TS in early bridge
- progressively moved to Rust crate (`reader_core`) with JSON fixture parity tests.

### 5.2 Full Rust Stage (Weeks 9+)

- UI: Rust-native (choose `slint` or `egui` by Week 10 gate).
- Domain logic: Rust only.
- TS/React renderer: removed.

## 6. Workstreams

## A. Platform Shell and Native API

Deliverable:

- Tauri app with command equivalents to current Electron API surface.

Current API parity targets from codebase:

- `library:getSources`
- `library:listBooks`
- `library:openBook`
- `library:addSource`
- `library:removeSource`
- `library:selectDirectory`
- `library:exportManifest`
- `library:importManifest`
- `secure-keys:isAvailable`
- `secure-keys:get`
- `secure-keys:set`
- `corpus:getInfo`
- `corpus:sampleArticle`

Acceptance:

- All renderer calls currently using `window.library`, `window.corpus`, `window.secureKeys` work unchanged behind a thin adapter.

## B. Domain Core Porting

Priority order:

1. `tokenizer` + ORP rules
2. `saccade` line/fixation/timing logic
3. `trainingDrill`, `trainingScoring`, `trainingRecall` rules
4. `rsvp` timing helpers
5. storage schema/migration logic

Acceptance:

- Rust results match TS fixtures for deterministic cases.

## C. Data Migration and Compatibility

Deliverable:

- Explicit user data export/import path for cutover.

Artifacts:

- `reader-export-v1.json` schema definition.
- Import tool for old local data.
- Backward-compatible loader tests with schema versions now in `storage.ts`.

Acceptance:

- Existing users can move to Tauri and later full Rust without manual data surgery.

## D. Quality Gates and Performance

Deliverable:

- Repeatable gates for parity and regression detection.

Gates:

- Behavior parity fixtures pass.
- No high-severity regression in reading/training/comprehension loops.
- Startup time and memory trend tracked before/after shell migration.

## E. Rust UI Migration

Deliverable:

- Rust-native vertical slices replacing React.

Slice order:

1. Home + content list + article load.
2. Paced reading (RSVP/saccade/generation).
3. Prediction/recall.
4. Training.
5. Comprehension check workflow.

Acceptance:

- Each slice is user-complete before moving to next.

## 7. Timeline and Milestones

## Phase 0 (Week 0): Setup and Baseline

Tasks:

- Lock current baselines:
- startup time
- idle memory
- reading-mode responsiveness
- Establish migration board with weekly gates.
- Create repo section for migration docs/runbooks.

Exit criteria:

- Baselines recorded and visible.
- Milestone board and checklist committed.

## Phase 1 (Weeks 1-2): Tauri Skeleton + API Contract

Tasks:

- Bootstrap Tauri app in-repo.
- Implement command contract mirroring current Electron APIs.
- Add renderer adapter layer (keep current React calls stable).
- Wire dev/build scripts for Tauri.

Exit criteria:

- App launches under Tauri.
- At least `library:getSources`, `library:listBooks`, `secure-keys:isAvailable`, `corpus:getInfo` wired end-to-end.

## Phase 2 (Weeks 3-4): Native Parity and Electron Sunset

Tasks:

- Complete all native command parity.
- Port path safety and allowed-root checks.
- Port PDF/EPUB/TXT extraction flow.
- Validate manifest import/export behavior.

Exit criteria:

- All current Electron-native user actions work in Tauri.
- Electron build no longer required for daily usage.
- Bridge guardrail becomes active: no new domain logic in TS.

## Phase 3 (Weeks 5-8): Rust Core Migration (High-Value Modules)

Tasks:

- Create `reader_core` Rust crate.
- Add JSON fixtures derived from TS behavior for:
- tokenizer
- saccade
- rsvp timing
- training drill/scoring logic
- Port these modules and swap TS call sites to Rust-backed commands.

Exit criteria:

- 60%+ of high-value deterministic domain logic served from Rust.
- Fixture parity pass rate >= 99% on deterministic cases.

## Phase 4 (Weeks 9-10): Rust UI Spike and Selection Gate

Tasks:

- Build same small vertical slice in both candidate UI stacks:
- Candidate A: `slint`
- Candidate B: `egui`
- Slice includes:
- article load
- RSVP playback
- keyboard shortcuts
- WPM controls

Decision gate:

- Choose one stack using scorecard:
- text rendering quality
- keyboard/timing fidelity
- implementation speed
- packaging/debug friction

Exit criteria:

- One Rust UI stack selected and documented.

## Phase 5 (Weeks 11-16): Rust UI Core Flow

Tasks:

- Implement production Rust UI for:
- Home/content browsing
- paced reading core loop
- persistence settings panel
- Integrate `reader_core` directly (no TS dependency).

Exit criteria:

- Daily reading flow is fully usable in Rust UI app.
- React app remains only for non-migrated flows.

## Phase 6 (Weeks 17-24): Complete Feature Cutover

Tasks:

- Port prediction/recall.
- Port training flow.
- Port comprehension check flow.
- Complete data import path from bridge storage if needed.
- Remove React renderer and TS runtime from production path.

Exit criteria:

- Full feature parity (or documented intentional deltas).
- Rust-only production desktop build shipped.

## 8. Detailed Deliverables by Week

Week 1:

- Tauri project scaffold, local dev run, basic command plumbing.

Week 2:

- Adapter bridge for current renderer APIs, partial parity demo.

Week 3:

- Full library source/list/open parity.

Week 4:

- Secure keys + corpus + manifest parity, Electron no longer default.

Week 5:

- Fixture harness committed, first Rust tokenizer parity.

Week 6:

- Rust saccade and RSVP timing parity.

Week 7:

- Rust training drill/scoring parity.

Week 8:

- First release candidate: Tauri shell + Rust core partial.

Week 9:

- Rust UI spikes started (`slint`, `egui`).

Week 10:

- UI stack decision finalized.

Weeks 11-16:

- Rust UI for primary reading workflows.

Weeks 17-24:

- Remaining workflow migration + TS removal.

## 9. Exit Criteria and Kill Criteria

## 9.1 Bridge Success Criteria (must meet by end of Week 8)

1. Tauri app is default desktop build.
2. Electron path is optional/frozen.
3. Rust handles native API surface.
4. At least three core domain modules running from Rust.

## 9.2 Full Rewrite Commitment Gate (Week 10)

Proceed only if:

1. Chosen Rust UI stack meets timing/keyboard requirements.
2. Team velocity is acceptable in spike.
3. No blocker found for text rendering/selection/readability behavior.

If gate fails:

- Remain on Tauri bridge and continue Rust core migration until blocker is solved.

## 9.3 Kill Criteria (re-scope trigger)

Trigger re-scope if any of these persists for 2 consecutive checkpoints:

1. Migration ratio lags plan by >25%.
2. High-severity regressions remain open >2 weeks.
3. Build/release process exceeds current Electron friction by a material margin.

## 10. Risk Register and Mitigation

1. Hybrid complexity drags on.
- Mitigation: no-new-domain-logic-in-TS rule + Week 10 UI decision gate.

2. Behavior mismatch in pacing/scoring.
- Mitigation: fixture-driven parity tests before swapping modules.

3. Data migration breakage.
- Mitigation: explicit export/import schema and rehearsal with real local data snapshots.

4. UI rewrite underestimation.
- Mitigation: dual-spike plus strict vertical-slice acceptance.

## 11. Metrics Dashboard

Track weekly:

1. `% domain logic migrated to Rust` (by module count and call volume).
2. `# Electron API surfaces remaining`.
3. `# fixture cases` and parity pass rate.
4. Startup time and idle memory delta vs Electron baseline.
5. Open high-severity migration regressions.

## 12. Immediate Next Actions (Next 7 Days)

1. Create migration board with phases/milestones from this document.
2. Bootstrap Tauri in a feature branch and get renderer loading.
3. Implement first four parity commands:
- get sources
- list books
- corpus info
- secure key availability
4. Draft fixture format and generate first tokenizer fixtures from current TS implementation.
5. Schedule Week 2 checkpoint with a demo-only goal: "Tauri boots and reads from local library."
