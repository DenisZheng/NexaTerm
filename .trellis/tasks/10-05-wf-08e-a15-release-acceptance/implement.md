# WF-08E Implementation

## Evidence framework
- [x] Add A15 evidence template.
- [x] Add final evidence validator.
- [x] Add validator unit tests for A09/A10, platform signing and performance blockers.
- [x] Add WF-08E source gate.
- [x] Wire CI step.
- [x] First green CI evidence: CI #369 / run `37268756990` PASS on `0a7509a6be8746e6222d52a1640a4b4d33947ca8`.

## Real predecessor gate
- [x] A09 maintainer-confirmed real Tauri PASS (2026-10-05).
- [x] A10 maintainer-confirmed real Tauri PASS (2026-10-05).

## Real release evidence
- [ ] Windows x64 install / launch / Authenticode / upgrade / rollback / locale / theme / brand.
- [ ] macOS ARM64 install / launch / Developer ID / notarization / upgrade / rollback / locale / theme / brand.
  - 2026-10-06 partial UI evidence: maintainer manually revalidated i18n on macOS at PR #42 `fix/a15-english-coverage` @ `66ae2dfcefaeb0a1898c616c8a8d85abd45459e1`; English mode showed no remaining Chinese text. This is source/dev UI regression evidence only and does not satisfy packaged install/signing/upgrade/rollback A15 blockers.
- [ ] Linux x64 install / launch / upgrade / rollback / locale / theme / brand.
- [ ] SHA256/updater signatures reconciled to candidate artifacts.
- [ ] mXterm → NexaTerm migration + rollback.
- [ ] WF-08D packaged startup/idle/memory/10-SSH/resource-release evidence.
- [x] Final Security / License / CI reconciliation: main CI #383 PASS on `4bd88f9060fe089ee6e52a042a5e589c1bb739bd`.
- [ ] Maintainer A15 signoff after validator reports zero blockers.

Nothing in the real-evidence section may be marked PASS from CI alone.
