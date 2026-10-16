# Implementation plan
1. Extend Rust kind/validation/bind outcome and tests for real occupied socket, no DNS, validation, cancellation and socket drop.
2. Extend typed contract and existing lazy form/translations; test fixed target, invalid port and scope.
3. Run focused frontend/types/build and source gates; Rust execution through unchanged three-platform CI.
4. Update code specs and Draft PR63. Manual acceptance deferred.

## Evidence
31 focused frontend tests PASS (SSH diagnosis + local controller/form), TypeScript noEmit PASS, startup/i18n/snapshot/line/diff gates PASS. Three Rust regression tests added; local toolchain unavailable, execution requires CI. Native GUI/themes remain deferred. C commit9cfb0f3 CI599 Frontend checks SUCCESS, including full tests/build; other jobs still running at this recording.
Final production build PASS (37.22s), including the preceding SSH diagnosis. Existing large-chunk warnings remain; diagnostics stay lazy.
