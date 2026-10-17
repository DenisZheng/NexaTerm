# Rlogin native establish adapter (L1)

## 1. Scope / trigger

Connect from an owned reserved IPv4 socket and complete the initial BSD wire exchange. No external client, DNS, IPC, consent UI, session quota, persistence, authentication inference or full protocol capability. Current Windows exact-flush limitations remain unchanged. This adapter is callable only from future backend session ownership after its own consent/quota checks.

## 2. Signatures

`connect(options: ConnectOptions<'_>, cancel: &AtomicBool) -> impl Future<Output=Result<RloginReader, ConnectError>>`. Options contain selected local IPv4, numeric target SocketAddrV4, local/remote user, terminal, speed and four u16 window dimensions. No Debug implementation exposes these fields. ConnectError wraps only fixed SocketError or ProtocolError and delegates its fixed code; no raw OS/server text.

`ReservedSocket::connect_until(target, cancel, deadline: Instant)` is crate-private; existing connect retains its 15s default. The explicit deadline is capped to the default maximum and checked before polling the owned connector.

## 3. Contracts

Validate the complete request and dimensions before bind: reuse L0 encoding, then the selected BSD profile's 30-byte users and 58-byte terminal/speed limit. Reject, never truncate. Reject unspecified/multicast/all-ones broadcast addresses or target port0 before any network operation.

The session owner can call crate-private connect_until with its earlier absolute deadline (including worker scheduling); the public default starts a15s deadline at entry. Check cancellation/deadline before and after the bounded synchronous source-port scan and before every request write/ACK read; pass the same deadline into connect, never restart it for the handshake. Native synchronous calls are not claimed interruptible; their socket stays owned until they return. Poll no-progress with at most25ms async sleeps, checking cancellation/deadline on return. Hold actual bound/connected handles throughout; drop/abort releases them without a detached worker. Partial writes retain their suffix; a zero write with pending bytes fails as IO.

Use the production incremental Handshake: ACK accepts only the initial exchange, nonzero status consumes bounded rejection privately until LF/EOF, and EOF before ACK is an error. After ACK, validate the final checkpoint and create the reader. Move the coalesced tail into its existing32KiB quarantine exactly once; no unbounded banner queue or second response copy retained. Readiness observation before handoff must not consume pending OOB; Darwin retains its EV_CLEAR notification in the owned monitor until an actual urgent read. An OOB peek at the current Darwin mark clears its position flag. Query position first and consume directly at the mark; only peek before reaching it. Never read past a known mark while awaiting an urgent byte. Reader urgent processing precedes delivery, flush clears this unrendered initial data only where exact boundaries are supported, and backpressure preserves order. All session quiet time remains unlimited after establish.

## 4. Validation / errors

| Input/event | Result |
| --- | --- |
| Invalid L0 fields/window or smaller BSD profile limits | fixed ProtocolError, no bind/write |
| Invalid selected IPv4 or zero target port | Socket(InvalidAddress), no IO |
| Cancelled / deadline reached in any establish phase | Socket(Cancelled / Timeout); owned socket dropped |
| Bind/connection/IO failure | fixed SocketError; no endpoint or raw OS payload |
| Nonzero server status / oversized rejection / no ACK EOF | fixed Rejected / RejectionTooLong / UnexpectedEof |
| ACK plus tail | owned RloginReader, raw tail delivered once, no authenticated state |

## 5. Good / base / bad

Good: validate first, reserve and retain one low socket, complete request and ACK within the original deadline, preserve binary tail and later data in order. Base: no network on import or invalid input. Bad: allocate a fresh15s budget after TCP connect, drop a partial-write suffix, treat ACK as login success, emit private rejection text, or present an ephemeral fixture as low-port compatibility.

## 6. Required tests

Exact BSD byte boundaries and no truncation; invalid address/window/pre-cancel; actual native loopback request and ACK coalesced tail delivered once under backpressure; private fragmented/oversized rejection and EOF distinctions; cancel during ACK, original deadline expiry, actual Tokio task abort and peer-observed EOF. Existing native reserved-port tests remain independent and report real host denial. The production module must be imported by the three-platform harness and full application CI.

## 7. Wrong vs correct

Wrong: call the old default-deadline connect and then start another15s handshake timeout. Correct: compute deadline once and use connect_until plus checks on the same Instant in writes/reads. Wrong: return a banner directly to UI before urgent handling. Correct: seed the reader's bounded unrendered queue before returning ownership.
