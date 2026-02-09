# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React + TypeScript renderer app.
- `src/components/` holds UI modules by reading mode and app surface.
- `src/hooks/` contains playback/state hooks (high-risk logic lives here).
- `src/lib/` contains pure utilities (tokenization, timing, storage, saccade logic).
- `src/test/` stores shared test helpers.
- `electron/` contains Electron main/preload code and file extractors.
- `library/` stores local content sources for Electron workflows.
- `docs/` contains maintenance runbooks and mode-specific design notes.
- Build artifacts (`dist/`, `dist-electron/`, `dist-electron-build/`) are generated output; do not edit directly.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: run web app locally (Vite).
- `npm run electron:dev`: run app in Electron for local file features.
- `npm run lint`: run ESLint across TS/TSX files.
- `npm run test`: run Vitest in watch mode.
- `npm run test:run`: run Vitest once (CI-style).
- `npm run build`: type-check and build web bundle.
- `npm run electron:build`: build Electron package (required when `electron/**` changes).

## Coding Style & Naming Conventions
- TypeScript `strict` is enabled; keep types explicit at module boundaries.
- Use 2-space indentation and single quotes; match semicolon usage already present in the file you modify.
- Components use PascalCase filenames/exports (example: `TrainingReader.tsx`).
- Hooks use `useX` camelCase naming (example: `usePlaybackTimer.ts`).
- Tests use `.test.ts` suffix and should sit near related code or under `src/test/`.
- Run `npm run lint` before opening a PR.

## Testing Guidelines
- Test stack: Vitest + Testing Library with `jsdom` (`vitest.config.ts`, `vitest.setup.ts`).
- Prefer deterministic tests: fake timers for playback behavior and storage helpers for persistence checks.
- Add regression coverage for bug fixes in core paths (`useRSVP`, `usePlaybackTimer`, mode switches) unless technically impossible.
- Required quality gates: `npm run lint`, `npm run test:run`, `npm run build`.

## Commit & Pull Request Guidelines
- Use short, imperative commit subjects (example: `Add recall scoring reset guard`).
- Maintenance tickets may use prefixes when applicable (example: `MNT-009: add CI gates`).
- Keep commits focused and avoid unrelated refactors.
- PRs should include linked issue/ticket, root cause, impact scope, and verification notes; include screenshots for UI changes.
- If `electron/**` is touched, verify `npm run electron:build` succeeds before requesting review.
