# Phase B Checklist

Date: 2026-02-18

Goal: reduce persistence churn and unify RSVP tokenization/persistence paths without behavior changes.

- [x] Memoize schema-version migration checks in storage.
- [x] Centralize article read/prediction/read-flag updates behind one storage mutation helper.
- [x] Avoid localStorage writes when article updates are no-ops.
- [x] Add in-memory coalescing for RSVP reading/prediction position persistence.
- [x] Route pause, completion, periodic saves, and prediction transitions through coalesced persistence helpers.
- [x] Consolidate repeated retokenization/page-state updates via a single internal `retokenizeArticle` path.
- [x] Run full verification (`bun run verify`) and confirm green.
