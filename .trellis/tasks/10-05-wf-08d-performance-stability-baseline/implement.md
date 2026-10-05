# WF-08D Implementation

## Measurement plumbing
- [x] Add opt-in Rust workspace-interactive probe.
- [x] Register Tauri state/command and frontend bridge.
- [x] Mark interactive once from WorkspaceShell.
- [x] Add cross-platform descendant process-tree RSS/CPU sampler.
- [x] Add sampler parser/math unit tests.

## Workload / gates
- [x] Define 5-launch startup workload.
- [x] Define idle CPU/RSS workload with mXterm 1.25 memory review rule.
- [x] Define 10 SSH + Split + SFTP + Transfer + Monitoring workload.
- [x] Define 3-cycle resource-release workload.
- [x] Define failure-isolation steps.
- [x] Add WF-08D source gate.
- [x] Wire CI step.
- [x] First green CI evidence: CI #364 / run `37266312459` PASS on `c0002d706c39f3c8508694803c3bf3524a12e2c0`.

## Real-platform evidence boundary
- [ ] Windows packaged startup/idle baseline.
- [ ] Windows mXterm comparable idle baseline and memory ratio.
- [ ] Windows 10 SSH workload observation.
- [ ] macOS ARM64 packaged startup/idle baseline.
- [ ] Linux x64 packaged startup/idle baseline.
- [ ] Resource-release / long-run evidence.
- [ ] Reconcile final review triggers.

Real-platform items above are intentionally not auto-PASSed by CI and may be completed in WF-08E/A15 final acceptance.
