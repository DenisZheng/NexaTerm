# Native legacy sockets and Rlogin control (L1 foundation)

## 1. Scope / trigger

IPv4 native TCP foundation for Rlogin and later Rsh, using existing locked Tokio/libc/windows-sys. No external clients, new crate version, helper, firewall change, DNS or automatic elevation. This slice has no terminal manager, handshake adapter, IPC, consent UI or usable-protocol capability. Future session owners must hold their own four-connection quota and verify consent; these low-level functions are not frontend commands.

## 2. Signatures

- `bind_reserved(local: Ipv4Addr, cancel: &AtomicBool) -> Result<ReservedSocket, SocketError>`
- `ReservedSocket::{local_addr, connect(target: SocketAddrV4, cancel: &AtomicBool), listen}`; connect is async and returns `NativeSocket`; listen consumes the reservation into a Tokio listener for later Rsh.
- `NativeSocket::{from_stream, local_addr, peer_addr, poll_ready, read, write, close}`; stream is owned, nonblocking, OOBINLINE=false and not clonable through this API.
- `RloginReader::new(socket, rows, columns, x_pixels, y_pixels)` owns an already-handshaken socket; the future handshake adapter must construct it only after ACK and transfer any coalesced tail exactly once.
- `RloginReader::{poll(output, has_capacity), input(bytes), resize(...), write(bytes), close}`. Events are Idle, Closed, Data(count), Control{flush_output, flow, window_frame}.

## 3. Contracts / budgets

Only selected local/remote numeric IPv4 addresses, neither unspecified/multicast/all-ones broadcast; target port is nonzero. Reservation tries1023 down to512, at most512 actual sockets, never high-port fallback. Disable reuse; Windows also sets SO_EXCLUSIVEADDRUSE before bind. Keep the actual bound socket until connect/listen/drop, never release it after a capability probe then pretend the port is reserved. Bind checks cancellation per candidate; connect has15s deadline and25ms cancellation polling, also cancelled by dropping its future. There is no background connector retaining a discarded fd.

Scan access-denied candidates too: Windows EACCES may reflect an occupied exclusive port. If all candidates deny access, return AccessDenied; all busy returns PortsBusy; mixed unavailable returns PortsUnavailable. These describe observed OS outcomes, not a blanket assertion that an administrator is required. Never infer privilege from the platform name. Other socket failures return fixed errors. No raw endpoint, username, payload or OS error is stored in errors or logs.

Read/write chunks are at most32KiB. Read buffers must be nonempty; zero-length successful read means EOF. WouldBlock/Interrupted means no progress, never EOF. Each receive poll is nonblocking and checks urgent readiness before normal data. Unix poll uses priority/band readiness and native at-mark query; Windows uses select exceptfds and ioctlsocket. Consume urgent with MSG_OOB; never scan normal bytes for control values.

Known urgent bits:02 flush,10 remote flow control,20 local flow control,80 window request. Process combinations; if10+20 both occur, local wins as in the selected BSD profile. Unknown bits are discarded as urgent metadata. Flush emits a control event first, then drains only normal bytes preceding the current urgent mark, bounded8KiB per poll. If TCP reports the urgent pointer before its byte is readable, quarantine at most32KiB of preceding data to advance the TCP window without displaying it. Fail explicitly on that budget or a15s pending-control deadline; this deadline never applies to an ordinary quiet connection. Flush discards the quarantine; other controls release it in order. This32KiB must count inside the future session owner's1MiB output budget. The caller must discard its own queued-but-unrendered output on that event; this slice does not implement the frontend queue. Preserve post-mark data. Urgent remains observable when output capacity is false or local output is paused. Normal data gets TCP backpressure in those states; no unbounded output queue.

Local flow starts enabled: input DC3 pauses normal output and DC1 resumes; all other bytes, including tilde escapes, are unchanged. Remote-flow mode forwards DC1/DC3 and releases local pause. Store the latest validated12-byte window frame. Resize before negotiation updates it without sending; an80 request returns that current frame; later resize returns a frame only after negotiation. Future writers must retain unsent suffixes and serialize control/user writes; low-level write reports actual count and does not silently drop a partial write.

## 4. Validation / errors

Fixed SocketError variants/codes only: InvalidAddress, InvalidChunk, UrgentBufferFull, AccessDenied, PortsBusy, PortsUnavailable, Unavailable, ConnectFailed, Timeout, Cancelled, IoFailed. Errors carry no raw source. Invalid address/cancel-before-bind performs no socket creation; malformed buffers do no read/write. Drop/close releases owned sockets; it does not prove that a remote process was terminated. Rlogin dimensions reuse L0 ProtocolError::InvalidWindow.

## 5. Good / base / bad

Good: reserve an actual low port, connect from that socket, receive80 via OOB and return the latest window frame while preserving ordinary80/FF/NUL bytes. Base: module import opens no socket. Bad: bind probe then release before connect, fall back to an ephemeral source port, swallow a permission failure, treat OOB as printable data or flush all future data without checking the urgent mark.

## 6. Tests

Bounded full candidate scan with injected busy/access-denied outcomes; scan past one denied candidate; pre-cancel/no IO; deadline/cancellation/drop release; real reserved ownership and connection peer-source verification or explicit observed access-denied evidence (not a skipped test). Native TCP OOB tests on all three OS: normal byte transparency, combined flags/window size, repeated request/resize, local pause/raw resume, flush with pre/post-mark bytes, urgent while output has no capacity, close/EOF and buffer budgets. The independent harness imports exact production modules with application-pinned dependencies and asserts its lock is an application-lock subset. Full application CI remains required.

## 7. Wrong / correct

Wrong: delete every02 byte, use SO_REUSEADDR on Windows to bypass conflicts, or call a WouldBlock read a disconnect. Correct: separate OOB, retain the real exclusive bound socket and return no-progress until readiness/EOF is known.

Primary sources: RFC1282; pinned BSD profile in task research; Tokio1.53.1 TcpSocket API; Microsoft select/recv/ioctlsocket/SO_EXCLUSIVEADDRUSE docs. No external implementation is copied.
