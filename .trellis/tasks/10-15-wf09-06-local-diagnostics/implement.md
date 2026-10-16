# Implementation
1. Implement manager/RAII leases and typed commands with main-window guard and destruction cleanup.
2. Add React operation controller and local network view; retain existing remote diagnostics separately.
3. Test reservation ownership/duplicate/cancel/drop/expiry/limits, UI races and errors; run types/full tests/build and source gates.
4. Update specs/evidence and Draft PR #63. No merge/release; real GUI/native/platform acceptance deferred. Rollback additive commands/component; no storage migration.

## Evidence
- LD01–LD04 implemented with one app-managed engine, main-window-only reserve/run/cancel commands, at most16 leases, 15-second unused expiry, RAII and window-destruction cleanup. Six manager Rust tests authored; local Rust toolchain unavailable, execution awaits CI.
- Existing network Tools entry contains local and remote forms. Local workspace and no-live-SSH fallback mount the lazy local form without SSH prerequisite. Inputs/results/UUIDs remain transient.
- Nine focused frontend tests PASS; full Vitest107 files/853 PASS/1 existing todo. Scripts178 PASS/3 existing skips/0 failures. TypeScript and final Vite build PASS (47.67s), local diagnostics3.98kB separate chunk.
- Startup boundary, i18n, workspace snapshot, capabilities/CSP, left Files, Local/WSL, Serial/Telnet, line budget and diff checks PASS.
- Extra legacy check-docker-tool-refresh-source.mjs FAILS on its old literal "暂停实时" assertion. Reproduced identically using HEAD's unchanged Docker source; current source uses docker.logs.pause i18n. This optional stale check is recorded, not weakened/removed and not claimed passing.
- Core baseline e236ad6 CI #597 all seven executing jobs SUCCESS; package Windows skipped. New commit's CI pending. Native IPC/window-close/protocol/theme GUI acceptance remains MANUAL_REQUIRED; SSH handshake/jump/local-port diagnostics remain future cuts.
