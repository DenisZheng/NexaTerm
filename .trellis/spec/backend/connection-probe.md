# Local connection probe core (WF-09-06A)

## 1. Scope / trigger
A backend core for explicit connection diagnosis before SSH exists. Current remote `network_tools` still runs through SSH and remains unchanged. This module is not registered as IPC and has no UI entry yet. No credential, Host Key, proxy/jump or terminal side effects. Future integration must label results as local direct-route probes, not end-to-end SSH reachability.

## 2. Signatures
`ProbeEngine::probe(&self, kind: ProbeKind, host: &str, port: u16, cancellation: &ProbeCancellation) -> ProbeResult` is async. `ProbeKind` is Dns/Tcp. `ProbeCancellation::cancel()` is sticky and clone-shared; create a fresh token per retry. Engine clones share limits; future IPC must register one engine per app, not instantiate per call.

## 3. Contract and lifecycle
Fixed five-second deadline includes resolver and all TCP attempts; up to sixteen addresses, one-second per-address TCP timeout. Four operation permits, four system resolver permits, acquired without waiting; no unbounded queue. IP literals bypass DNS. Resolver permit moves into `spawn_blocking` and survives caller timeout/cancel/drop until actual system lookup finishes. OS resolution cannot be forcibly interrupted. RAII releases sockets and operation permits on completion or caller drop. TCP sends no application payload and drops the connected socket immediately.

`ProbeResult` serializes only kind, status, reason, duration_ms, address_count (0–16), addresses_truncated. It never contains hostnames, IPs, credentials, OS error strings, command output or runtime IDs. No logs or persistence. A successful TCP connect says nothing about SSH authentication or Host Key trust.

## 4. Validation / error matrix
- Invalid host: empty, >253 bytes, non-ASCII/non-DNS label syntax, URL/userinfo/embedded port, shell syntax, whitespace; return invalid_input/invalid_host before acquiring I/O permits. Raw IPv4/IPv6 literals allowed; bracketed IPv6 and scope identifiers not supported in this cut. ASCII punycode accepted, raw Unicode rejected.
- TCP port 0: invalid_input/invalid_port. DNS ignores port as a service probe.
- Pre-cancel: cancelled/cancelled before validation/I/O. In-flight cancel wins a simultaneous ready result via biased select.
- Saturated operations/resolvers: unavailable/busy; do not enqueue more workers.
- Resolver error/empty addresses: failed/resolution_failed or failed/no_addresses. Worker join failure: unavailable/worker_unavailable.
- Deadline/any candidate timeout without success: timed_out/deadline; no raw failure text.
- All tried addresses refuse: failed/connection_refused, unless candidates were omitted; omitted candidates without success are unavailable/address_limit, not definitive failure.
- DNS success returns capped count plus truncation flag; TCP success returns success/connected and closes socket. Other TCP errors are failed/connect_failed.

## 5. Cases
Good: explicit loopback TCP succeeds and the accepted peer reads EOF without payload. Base: literal DNS returns count=1 without resolver work. Bad: URL with userinfo is rejected without echoing it; repeated cancellation cannot start a fifth still-running OS resolver.

## 6. Required tests
`connection_probe_tests.rs`: validation, secret-free serialization, literal DNS, pre-cancel, shared operation saturation/release, loopback TCP connect/EOF/refusal, total deadline/drop, in-flight cancellation/drop, blocked resolver permit survival after caller abort, capped address iteration, resolver error sanitization/release. Loopback tests use ephemeral ports; resolver lifecycle tests inject a controlled blocking closure and no public targets. CI Rust checks/tests must run on Windows/macOS/Linux. Real resolver/platform/UI acceptance remains MANUAL_REQUIRED.

## 7. Wrong vs correct
Wrong: drop the resolver JoinHandle and release its quota when the UI cancels, or create one engine per click. Correct: let the blocking worker own its permit until actual completion, and share the engine at app scope. Wrong: show raw OS errors/targets in exports or call TCP success SSH success. Correct: fixed reason codes and an explicit direct-route scope.
