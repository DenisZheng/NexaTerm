# WF-08E Implementation

## Evidence framework
- [x] Add A15 evidence template.
- [x] Add final evidence validator.
- [x] Add validator unit tests for A09/A10, platform signing and performance blockers.
- [ ] Add WF-08E source gate.
- [ ] Wire CI step.
- [ ] First green CI evidence.

## Real predecessor gate
- [ ] A09 maintainer-confirmed real Tauri PASS.
- [ ] A10 maintainer-confirmed real Tauri PASS.

## Real release evidence
- [ ] Windows x64 install / launch / Authenticode / upgrade / rollback / locale / theme / brand.
- [ ] macOS ARM64 install / launch / Developer ID / notarization / upgrade / rollback / locale / theme / brand.
- [ ] Linux x64 install / launch / upgrade / rollback / locale / theme / brand.
- [ ] SHA256/updater signatures reconciled to candidate artifacts.
- [ ] mXterm → NexaTerm migration + rollback.
- [ ] WF-08D packaged startup/idle/memory/10-SSH/resource-release evidence.
- [ ] Final Security / License / CI reconciliation.
- [ ] Maintainer A15 signoff after validator reports zero blockers.

Nothing in the real-evidence section may be marked PASS from CI alone.
