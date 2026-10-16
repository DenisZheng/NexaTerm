# Native Rlogin protocol core (L0)

## 1. Scope / trigger

RFC1282 BSD Rlogin wire core, implemented independently in Rust with no external client or new dependency. L0 does not open production sockets, register IPC, advertise a supported connection, authenticate a user or implement urgent/OOB transport. Those remain L1/L2. A loopback TCP fixture proves framing and incremental parsing, not real-server compatibility.

## 2. Signatures

- `encode_request(local_user: &str, remote_user: &str, terminal: &str, speed: u32) -> Result<Vec<u8>, ProtocolError>`
- `Handshake::new(); receive<'a>(&mut self, bytes: &'a [u8]) -> Result<HandshakeProgress<'a>, ProtocolError>`
- `HandshakeProgress::{Pending, Accepted(&[u8])}`; accepted carries the unconsumed tail of the current input without copying it.
- `Handshake::end_of_stream(&mut self) -> Result<(), ProtocolError>`
- `window_size_frame(rows: u16, columns: u16, x_pixels: u16, y_pixels: u16) -> Result<[u8;12], ProtocolError>`

## 3. Contracts

Request is initial NUL, local user NUL, remote user NUL, terminal/speed NUL. Usernames are nonempty, at most256 UTF-8 bytes and contain no control characters; do not trim or silently truncate. Terminal is1–64 ASCII bytes from alphanumeric/underscore/dot/plus/minus; slash is generated only as the delimiter. Speed is a nonzero u32, encoded as decimal.

Only the first server byte is the handshake status. Zero means the server accepted the initial exchange, never that login/authentication succeeded. All following bytes are terminal data; preserve NUL, FF and control bytes exactly. Nonzero means rejection; count and discard its text through LF/EOF, with at most1024 message bytes before LF and no raw message retention. Errors are sticky. Reuse after acceptance returns already_finished; the caller must transfer the unconsumed tail to the data transport once.

The window frame is FF FF s s, then rows/columns/x-pixels/y-pixels as four big-endian u16 fields. Rows/columns must be nonzero; zero pixel sizes are valid. Sending it is permitted only after the server's window request in L1; encoding a frame alone does not establish that negotiation.

## 4. Validation / errors

`ProtocolError` contains fixed variants/codes only: invalid_user, invalid_terminal, invalid_speed, invalid_window, rejected, rejection_too_long, unexpected_eof, already_finished. It contains no usernames, terminal text, server message or endpoint. Empty receive is pending while awaiting status. EOF before status is unexpected_eof; EOF during rejection is rejected; EOF after acceptance completes the parser successfully. Error text is not passed through AppError or UI in L0.

L1 must add a bounded overall connection/handshake deadline and cancellation; this incremental pure parser does not own time, sockets or buffers. Never wait indefinitely for an unterminated rejection in a future adapter.

## 5. Good / base / bad cases

Good: fragmented ACK plus banner yields one accepted exchange and every banner byte exactly once. Base: request encoding and resize encoding perform no IO. Bad: treating ACK as authenticated, parsing in-band FF as Telnet IAC, retaining a server rejection/password in an error, or enabling capability before OOB/flow-control/source-port/lifecycle integration.

## 6. Tests

Exact RFC request and resize bytes; both username byte budgets, empty/NUL/control inputs, terminal delimiter/ASCII/length validation and zero speed; every handshake chunk width including ACK+banner coalescing, byte transparency, every nonzero status, rejection fragmentation/limits/sticky errors, EOF in each state and parser reuse. Actual loopback TCP fixtures read the entire request and exercise ACK+binary data, fragmented rejection and EOF-before-ACK. All fixture sockets have IO timeouts and listener accept has a bounded deadline.

The standalone native workflow compiles the same production module with `rustc --test` on Windows/macOS/Linux, without another Cargo dependency graph. Full application CI also compiles and runs these tests.

## 7. Wrong / correct

Wrong: return a connection-success state after seeing any received bytes, drop a coalesced banner, or display the rejection string as an exception. Correct: consume exactly one status byte, return the accepted tail and use fixed rejection errors with bounded counting.

Primary protocol source: https://www.rfc-editor.org/rfc/rfc1282.html. No external implementation source was copied.
