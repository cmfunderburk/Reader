# Tauri Bridge -> Full Rust Migration Board

Last updated: 2026-02-19
Source plan: `docs/random/tauri-bridge-to-full-rust-plan-2026-02-19.md`

## Locked Guardrails
- Feature freeze for non-critical UI additions during bridge period.
- No new business rules in `src/lib/*.ts` after Week 4.
- Every migrated domain module requires Rust implementation + parity fixtures.
- Monthly sunset checkpoint: if migration ratio is below target, cut scope or pause new features.

## Milestones

| Milestone | Status | Exit Criteria |
|---|---|---|
| M0: Setup + Baseline | In Progress | Baselines captured, board/runbooks committed |
| M1: Tauri Skeleton + API Contract | In Progress | App launches in Tauri; first four parity commands wired |
| M2: Native Parity + Electron Sunset | Planned | Existing Electron-native actions work in Tauri |
| M3: Rust Core Migration | Planned | `reader_core` crate + >=60% deterministic logic in Rust |
| M4: Rust UI Spike + Stack Selection | Planned | `slint` vs `egui` gate closed with decision memo |
| M5: Rust UI Core Flow | Planned | Daily reading flow complete in Rust UI |
| M6: Full Cutover | Planned | Rust-only production desktop build shipped |

## Phase 0/1 Slice (This Branch)

Status: In Progress

Delivered:
- `src-tauri/` scaffold added with initial command surface.
- Tauri commands implemented:
  - `library_get_sources`
  - `library_list_books`
  - `library_open_book`
  - `library_add_source`
  - `library_remove_source`
  - `library_select_directory`
  - `library_export_manifest`
  - `library_import_manifest`
  - `secure_keys_is_available`
  - `secure_keys_get`
  - `secure_keys_set`
  - `corpus_get_info`
  - `corpus_sample_article` (compat add-on)
- Renderer compatibility adapter added in `src/lib/nativeBridge.ts`, keeping `window.library`, `window.corpus`, `window.secureKeys` call signatures stable.
- Scripts added:
  - `bun run tauri:dev`
  - `bun run tauri:build`
  - `bun run tauri:check`

Open items for M1 completion:
- Validate app launch and first-four command path end-to-end in a local Tauri session.
- Native PDF/EPUB extraction parity in Rust (current bridge supports TXT and normalized `.txt` sidecar fallback for PDF/EPUB).

Validation blockers in current dev environment:
- None for `bun run tauri:check` after installing `webkit2gtk-4.1` (includes `javascriptcoregtk-4.1` pkg-config target on Arch).

## Week Gate Checklist

### Week 1
- [x] Tauri scaffold committed
- [x] Basic invoke plumbing committed
- [ ] Tauri dev app launch validated on target machine

### Week 2
- [x] Renderer adapter added
- [x] First four parity commands implemented
- [x] Remaining `library:*` and `secure-keys:*` command surface wired
- [ ] Demo checkpoint recorded (`Tauri boots and reads from local library`)

## Metrics Dashboard (Weekly)

| Metric | Target | Current | Notes |
|---|---|---|---|
| `% domain logic migrated to Rust` | >=60% by Week 8 | 0% | Core module migration starts in Phase 3 |
| `# Electron API surfaces remaining` | 0 for bridge parity | 0 (command surface) | PDF/EPUB native extraction still pending in Rust |
| `Tokenizer fixture parity pass rate` | >=99% deterministic | 100% (8/8) | Fixture harness + parity test active |
| `Startup delta vs Electron baseline` | Neutral or better | Pending | Capture using runbook |
| `Idle memory delta vs Electron baseline` | Neutral or better | Pending | Capture using runbook |
