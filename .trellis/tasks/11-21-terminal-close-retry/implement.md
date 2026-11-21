# Implementation plan

## Backend

- [x] Introduce per-session lifecycle entries and serialized close helpers.
- [x] Keep failed close entries registered; make close of an already-removed session idempotent.
- [x] Coordinate reader-exit removal with explicit close.
- [x] Attempt SSH jump-host cleanup even when the target disconnect fails; persist per-resource success in the live session object.
- [x] Treat an already-exited Local child as successfully closed.
- [x] Add Rust tests for failed-close retry, concurrent close and reader-exit cleanup retention.
- [x] Update the WF-06B source contract for stateful Terminal jump-chain cleanup progress.

## Frontend

- [x] Add an in-memory close coordinator with in-flight deduplication and pending failure records.
- [x] Route all close calls, including late connection results, through the coordinator.
- [x] Add a compact retry alert and English / Simplified Chinese strings.
- [x] Add unit tests for failure retention, retry success, and concurrent duplicate calls.

## Verification

- [ ] `cargo fmt --all -- --check` (not executed in the hosted GitHub workflow)
- [x] `cargo test --workspace --locked` — Windows, Linux and macOS CI passed.
- [x] `pnpm run check` — frontend type check passed.
- [x] `pnpm test` and `pnpm run test:scripts` — frontend and script suites passed.
- [x] `pnpm run build` — production build passed.
- [x] `node scripts/check-startup-module-boundary-source.mjs` — passed.
- [x] CI run `44913382927`: Frontend, Rust Linux, Rust Windows, Rust macOS, Security, License, and fixture smoke all passed.
- [ ] Manual smoke: close a live SSH tab, close during connect and let the result arrive late, close a Local tab while its process exits, retry after an injected close failure, and close one of two instances of the same profile.

Do not archive the task or claim A01–A08 complete until CI and the manual smoke checks have been reviewed.
