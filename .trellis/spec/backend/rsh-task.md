# Rsh command-task owner

## 1. Scope / trigger
S2 under the existing WF-09 task and approved plan S01-S03/C01-C02. Native owner is implemented here; IPC/UI and real rshd remain separate evidence until integrated. No new dependency, persistence, shell execution or automatic replay.

## 2. Signatures
`TaskManager::{reserve(owner,TaskRequest,consent),start,write,write_text,close_stdin,signal,read(ack:Option<u64>),status,cancel,close,shutdown,shutdown_wait,cancel_window}`. Request freezes Destination/local interface, independent users, exact command bytes, encoding and run_timeout_seconds (0=none, <=86400). InitialExchangeReady proves initial ACK only. Status exposes phase/reason, three independent EOF flags, awaiting_ack and finished; no remote exit code.

## 3. Contracts and budgets
Shared legacy_session lease table enforces16handles/15s unused TTL/one start and nonwaiting4worker admission. App injection shares Resources between Rlogin/Rsh; default standalone managers remain isolated. Shared legacy_dns preserves owned blocking OS calls and fixed protocol error mappings. Rlogin urgent/flush/resize stays separate. Strict legacy_text conversion preserves the existing8 encodings and rejects loss/substitution.

One actor owns both transports. Actual partial stdin suffix retains its full byte/item credit; EOF follows every accepted input, half-closes once and then refuses new input. Independent32signal FIFO uses fixed BSD mapping and progresses under output pressure. Reads alternate stdout/stderr with independent per-stream budget1MiB inclusive of queue+flight,32KiB ACK tail,32KiB scratch and32KiB response copy. Input<=1MiB inclusive of one32KiB conversion copy; items<=32 inclusive of current partial write. There is one global output flight, exact nonzero sequence, idempotent last ACK; invalid ACK cannot free credit. Status cannot consume or evict output. Finished output drains before handle removal.

Original15s establish deadline includes DNS; optional runtime limit begins after ACK. cancel only signals; close/shutdown_wait wait actual worker/DNS/FD release and transient command/input disposal. Guard field drop order closes both FD/current input before lease completion, including abort. No EOF=>exit0 or local cancel=>remote kill claim.

## 4. Validation / errors
Wrong owner or missing consent => Denied/ConsentRequired before IO. Invalid target/user/command/encoding/timeout fails before reserve. Busy covers handles, real workers, input/signal budgets. Reused/expired handles cannot start. Stdin after EOF request => StdinClosed. Unknown/future ACK => InvalidAck. Native errors map fixed codes; no target/user/command/server/OS text. Cleanup failures remain failures.

## 5. Good / base / bad
Good: explicit run freezes command, both stream tails drain, renderer ACK returns credit, explicit rerun gets new consent/UUID. Base: socket fixture validates owner above production S1 transport without claiming reserved-source/rshd integration. Bad: drop stderr after stdout EOF, release quota on cancelled start caller, queue signal behind full stdout, persist command, or count local closure as command success.

## 6. Tests
Actual two-socket owner fixtures cover byte-exact binary outputs, late stderr, stdin FIFO/EOF, five signal bytes, saturated stdout with independent stderr/control/cancel, non-consuming status, runtime timeout, task abort and real FD release, TTL/consent/single use/4worker, cancelled start and gated DNS shutdown. Rlogin regressions and production native harness must execute on all3platforms; full application CI still required.

## 7. Wrong vs correct
Wrong: dequeue frees output credit; correct: retain until exact renderer ACK. Wrong: command replay on reconnect; correct: each run is an explicit new lease. Wrong: return from close at cancellation; correct: wait actual worker completion after sockets, command and pending input are dropped.
