# Rlogin DNS and frozen destinations

## 1. Scope / trigger

Extend approved WF-09-08A L01-L03/C01-C02 numeric entry with ASCII hostnames. Same WS-P01/P02/P04 and WS-R01/R02, no new product workflow or external resolver dependency. Local bind stays explicit numeric IPv4; Windows runtime remains unavailable without exact urgent/flush.

## 2. Signatures

`Destination::parse(host:&str,port:u16)` returns a numeric IPv4 or owned ASCII hostname. Port1..65535. `Destination::validate()` performs syntax only. `Resolver::resolve(destination,cancel,deadline)` chooses a fixed valid IPv4. One app/session-manager resolver shares four owned worker permits; no per-click fresh engine.

SessionRequest stores Destination, freezes it at reserve after single-run consent, validates protocol fields without resolving and resolves only in its owned start actor before bind/connect. SessionRequest.options receives the pinned resolved numeric endpoint. Existing IPC target_address remains a string; capability dns_available follows the supported runtime. No persisted consent, UUID, address list, cached resolution or credential lookup.

## 3. Contracts

Accept canonical numeric IPv4 or ASCII DNS labels (1..63 bytes, alphanumeric/hyphen, no edge hyphen), optional trailing dot, full input<=253 bytes. Reject URL/ports/IPv6/whitespace/non-ASCII and numeric-looking invalid IPv4. Do not reinterpret invalid numeric IPv4 as a hostname. Saved/imported metadata may preserve hostname case/trailing dot; DNS itself is case-insensitive. No network during profile validation.

Resolver bypasses OS for numeric input, validates numeric destinations, scans at most17 returned entries and retains at most16 unique valid IPv4 candidates; pins the first in OS order and never retries a new endpoint after partial protocol IO. No IPv6 fallback, proxy, privilege or high-port fallback. Fixed errors only, no OS strings or resolved addresses in status.

Blocking OS calls cannot be forcibly cancelled. The worker owns its permit until actual completion; the session actor retains its lifetime/lease until it returns. Cancellation/deadline checkpoints prevent later bind/connect and late result publication. The shared15s budget controls establishment; an already issued OS call may delay actual cleanup beyond it, and close remains pending rather than claiming completion. No detached unlimited resolver task or early capacity release. Numeric sessions need no resolver permit.

## 4. Validation/error matrix

Invalid syntax/port/address -> legacy_socket_invalid_address before resolver; resolver saturation -> rlogin_session_busy without OS call; OS failure/no valid IPv4 -> fixed rlogin_dns_failed/rlogin_dns_no_ipv4; cancellation/deadline -> existing fixed cancelled/timeout, never subsequent bind/connect. Result cap never triggers another lookup. Caller drop cancels session; real worker completion still owns capacity/close.

## 5. Good/base/bad

Good: preserve saved hostname, approve frozen target, resolve once, pin one IPv4 and establish before original deadline. Base: numeric IPv4 bypasses DNS and keeps all old session/flush behavior. Bad: hostname resolution during save, dropping quota on UI cancel, resolving after cancellation and connecting a late result, accepting127.0.0.999 as a DNS name or silently retrying an already-contacted service.

## 6. Required tests

Syntax boundaries, local IPv4-only, no-I/O saved/import roundtrip, direct numeric bypass, bounded/deduplicated candidate selection, IPv6/no-address failures, actual localhost resolution, quota while worker is gated after cancel/deadline/drop, late result rejected/no connect, original establishment deadline, exact frozen frontend target/consent. Run native three-platform harness and full app CI; real rlogind/WebView evidence separate.

## 7. Wrong vs correct

Wrong: timeout a blocking resolver and drop its permit with the UI future. Correct: move permit into the real worker and retain session cleanup until actual return. Wrong: resolve each candidate again during connect. Correct: dial the pinned numeric endpoint once.
