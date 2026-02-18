# Phase A Checklist

Date: 2026-02-18

Goal: low-risk, behavior-preserving cleanup before larger refactors.

- [x] Remove vestigial `customCharWidth` pipeline from settings/App/useRSVP.
- [x] Deduplicate shared WPM limits (`MIN_WPM` / `MAX_WPM`).
- [x] Deduplicate `normalizeText` usage in comprehension exam context builder.
- [x] Deduplicate shared Electron contract types in main/library modules.
- [x] Simplify `useKeyboard` listener dependency churn.
- [x] Reduce `useRSVP` ref-sync boilerplate.
- [x] Run verification (`bun run verify`) and confirm green.
