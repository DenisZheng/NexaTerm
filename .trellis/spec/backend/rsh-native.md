# Rsh native dual transport

## 1. Scope / trigger

WF-09-08B S1; approved plan §6, S01/S02/S03/C01. Actual sockets, without new IPC/schema/menu/capability/dependencies or elevation. No real rshd or GUI acceptance implied. Reuse S0 profile and legacy_socket allocator; Windows urgent support is irrelevant to Rsh ordinary streams.

## 2. Signatures

`rsh::ConnectOptions{local:Ipv4Addr,target:SocketAddrV4,local_user:&str,remote_user:&str,command:&[u8]}`. `rsh::connect(options,cancel:&AtomicBool)->Result<RshTransport,NativeError>`; internal `connect_until(...,deadline:Instant)` retains the caller's original budget. `NativeError::{Socket(SocketError),Protocol(ProtocolError),StdinClosed}` returns only fixed codes.

`RshTransport::{read_stdout(&mut[u8]),read_stderr(&mut[u8]),write_stdin(&[u8]),send_signal(Signal)}` return `Result<Option<usize>,NativeError>` (None=retry, read0=that stream EOF, write=actual progress). `close_stdin()->Result<(),NativeError>`; `output_complete()->bool`; consuming `close()->Result<(),NativeError>`. `NativeSocket::shutdown_write()` is internal and affects only the write direction.

## 3. Contracts

Validate exact bounded fields and addresses before IO. Bind and own reserved listener first, then another reserved main socket; original15s deadline across both binds/connect/callback/request/ACK, cancellation at25ms waits and every candidate/IO checkpoint. No high-port fallback, permission changes, address retry or command replay. Actual bind may finish after deadline; next checkpoint prevents further IO.

Send reserved listener port+NUL before waiting for callback. Accept only exact target IPv4 and callback source512..1023. Drop invalid candidates, max16 then fail; listener dropped on verified acceptance/error/cancel. During callback wait read main rejection/EOF; first nonzero status stops command writes, bounded rejection parser discards private bytes. Zero ACK before all metadata/command writes is invalid. After verification pump bounded32KiB writes and reply reads; no request suffix replay. ACK-tail allocation is bounded by32KiB and transfers once to stdout.

Transport owns exactly two uncloneable sockets and at most32KiB initial stdout. Per-call read nonempty<=32KiB/write<=32KiB. Caller owns unconsumed input suffix and queue budgets. Independent EOF flags; output_complete only after both streams read EOF, no exit status/success claim. stdin EOF must be serialized after pending writes; idempotent successful shutdown_write retains both read directions. Later stdin returns rsh_stdin_closed. Signal bytes ordinary secondary writes, available after stdin EOF; caller retries None. close executes both closes even if first fails; drop/aborted future releases actual handles, with no spawned connector. Neither proves remote process killed.

## 4. Validation / errors

Invalid numeric address/port, user or exact command -> fixed existing socket/protocol error before bind. Current process inability to reserve ports -> AccessDenied/PortsBusy/PortsUnavailable, no platform-name permission assumption. Invalid candidate16 -> rsh_invalid_secondary_peer. Early ACK -> rsh_invalid_handshake; rejection/oversize/EOF -> fixed parser errors, no server text. Original deadline/cancel -> Timeout/Cancelled. Invalid chunk leaves prefix/socket untouched. Stdin after half-close -> rsh_stdin_closed. IO failure never becomes normal EOF.

## 5. Good / base / bad

Good: verified reserved callback, exact raw command, ACK+binary stdout and separate binary stderr; half-close stdin, drain both tails. Base: ordinary socket fixture proves stream behavior, actual low-port fixture separately records availability or denial. Bad: first arbitrary callback accepted, command sent before verification, interpreting stderr first byte as status, dropping stderr when stdout closes, reporting exit0, or converting low-port denial into high-port success.

## 6. Required tests

All three native platforms: full command cap chunking/exact bytes, invalid/pre-cancel/expired options, early ACK and private fragmented rejection, callback wait rejection/EOF,16 invalid high-port candidates, original deadline/cancel and actual task abort release both sockets. Independent binary streams/late stderr, prefix consumed once, half-close preserves outputs and signal bytes1/2/3/9/15, invalid chunks consume no data, close/drop releases both. Actual reserved main/listener/server-callback fixture must inspect source ports/IP and exact request plus both output tails; honest AccessDenied is negative evidence, never an ignored test or real-rshd pass. Full application CI still required.

## 7. Wrong vs correct

Wrong: reuse whole-socket close for stdin EOF, or call secondary.close only after main.close succeeds. Correct: shutdown main Write only; full close evaluates both closes before returning first error. Wrong: wait only on callback accept while main has already rejected. Correct: poll main rejection/EOF within the same original deadline and do not transmit command after rejection starts.
