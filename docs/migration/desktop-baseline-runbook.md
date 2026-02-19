# Desktop Baseline Runbook (Electron vs Tauri)

Last updated: 2026-02-19
Related board: `docs/migration/tauri-rust-migration-board.md`

## Purpose
Record consistent startup, idle-memory, and responsiveness baselines before and during the Electron -> Tauri bridge migration.

## Preconditions
- Use the same machine for all baseline runs.
- Close other heavy desktop apps before measurement.
- Use production entrypoints (`electron:preview` / Tauri built binary where possible) for final baseline values.
- Record exact commit SHA for every run set.

## Metrics
1. Cold startup time (process start -> first interactive frame).
2. Warm startup time.
3. Idle RSS memory after 60s on Home screen.
4. Basic responsiveness:
   - open content browser
   - load one article
   - start/stop paced reading

## Suggested Commands

Electron (preview path):
```bash
bun run electron:build
/usr/bin/time -f "elapsed=%E rss_kb=%M" bun run electron:preview
```

Tauri (bridge path):
```bash
bun run tauri:build
/usr/bin/time -f "elapsed=%E rss_kb=%M" bun run tauri:dev
```

## Capture Template

| Date | Commit | Shell | Run Type | Cold Startup | Warm Startup | Idle RSS (MB) | Notes |
|---|---|---|---|---|---|---|---|
| 2026-02-19 | `<sha>` | Electron | Baseline | TBD | TBD | TBD | |
| 2026-02-19 | `<sha>` | Tauri bridge | Baseline | TBD | TBD | TBD | |

## Responsiveness Checklist
- [ ] Home screen interactive within baseline envelope.
- [ ] Content browser opens without regressions.
- [ ] Article load path (library/corpus) works.
- [ ] RSVP start/pause keyboard loop works.
- [ ] No high-severity UI freeze/crash during 10-minute session.

## Reporting
- Update the table in this file at each weekly checkpoint.
- Mirror summary deltas into `docs/migration/tauri-rust-migration-board.md`.
