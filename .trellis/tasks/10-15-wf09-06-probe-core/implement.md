# Implementation
1. Implement bounded core and sanitized typed result contract.
2. Test loopback TCP success/refusal, literal DNS, invalid input, pre/in-flight cancel, deadline, operation and resolver saturation, retained resolver permit, resource release and secret-free serialization.
3. Validate source gates/diff and CI Rust across platforms (no local Rust toolchain).
4. Update backend spec and create stacked Draft PR against WF-09-05. No merge/release. Real network/platform/UI acceptance MANUAL_REQUIRED; IPC/UI follow-up remains explicit.
Rollback: revert additive module and task/spec; no persisted data changes.

## Evidence
Implemented core with shared 4-operation/4-resolver limits, 5-second deadline, 16-address budget, one-way cancellation and fixed-code results. Added 11 Rust tests including real loopback TCP/EOF and controlled blocking resolver retention. Local line budget and diff whitespace checks passed. Rust toolchain is unavailable locally; tests are authored but not yet claimed executed. CI must verify compilation and tests on three platforms. No frontend, IPC, dependency or persisted schema changes. UI/IPC, SSH/jump/local-port diagnostics and real platform acceptance remain follow-ups.

## CI #595 correction
All three platform Cargo check jobs passed, but Cargo test and fixture Rust test builds failed with E0282 at connection_probe_tests.rs:139. The release-only mpsc channel never sends a value, so its generic type cannot be inferred. Explicitly use channel::<()>(); retain the existing blocked-worker lifetime assertions. This is a test compilation correction, not a skipped gate or runtime fallback. New CI must execute the tests before claiming success.
