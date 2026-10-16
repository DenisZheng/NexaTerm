# Implementation
1. Add core owner, bounded file loading and HTTP server with actual loopback lifecycle/security tests.
2. Register main-only IPC, shutdown/window cleanup and typed wrappers.
3. Add native picker, lazy Tools component/controller with operation ownership tests; bilingual UI and shared tokens.
4. Review HTTP validation, quota survival, exact-id stop, all close/error paths and secret exclusions. Run focused tests/types/build/source gates; execute Rust and full suites in unchanged CI.
5. Update code specs, Draft PR and09 delivery ledger; leave real acceptance as MANUAL_REQUIRED.

## Core evidence
Core/HTTP/IPC and eight Rust tests implemented. Diff/line checks pass; local cargo unavailable, three-platform CI execution required. UI integration in progress; not yet a completed end-to-end feature.
