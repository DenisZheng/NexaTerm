# Rsh transient command task

## 1. Scope / trigger
WF-09-08B S2, WS-P01/P02/P04 and WS-R01/R02; approved S01-S03/C01-C02. New session opens an independent closable Rsh task instance. It is not a PTY or a saved connection protocol. No schema change or automatic restore/replay. Same light-neutral prototype, shared Radix/Lucide/AppSelect/forms/buttons and global --mx tokens; actual UI/runtime lazy loaded.

## 2. Signatures
RshWorkspaceSessions.open/get/close/forget/dispose privately own RshTaskSession {owner,output}. RshTaskOwner.run(request,renderer) is explicit; send/stdinEof/signal/cancel/close act on its private generation. Public getSnapshot/subscribe expose only metadata. Typed rshCommands mirrors rsh-runtime.md and parses all responses. Shared legacyWire preserves byte/canonical UUID/u64 validation for both protocols, including sparse-array rejection.

RshCommandPane collects exact transient target/users/command/encoding/timeout and per-run plaintext consent. Editing any run field clears consent; running clears it again. Validation focuses a linked error summary and preserves input. stdin is sent exactly without added newline. Backend freezes its encoding and rejects lossy conversion. Native status and operation errors use fixed translated messages.

## 3. Contracts / budgets
No target, user, command, UUID, input or output is added to workspace tab metadata. source:rsh is only a transient projection marker. Snapshot collection omits the entire task, order/panes/active IDs are sanitized, tree does not invent a saved connection, split/clone/reconnect cannot rerun it. MultiExec/macros/history/AI/public terminal_close and PTY actions exclude it even if given an adversarial public sessionId.

One flight at a time. RshOutputBuffer retains exact per-stream bytes (1MiB logical budget includes one32KiB pending response); full display waits for explicit clear, never automatically truncates. Actual committed DOM rendering or deliberate user clear precedes ACK. UTF-8 split characters remain buffered; malformed text falls back to exact hex. Two separate output labels, counters and observed EOF are visible. While renderer waits, one250ms status poll at a time reports transport-end/draining independently without consuming bytes; one completion observer/timer, no accumulating promise handlers. No exit0/success inference.

Cancel bypasses render/input/signal queues, cancels late reserve/start and closes any late private handle without starting it. close waits actual backend cleanup, startup/read work, input/EOF and signal IPC; failed cleanup retains the same task and retry-close. Input EOF is serialized after accepted input and blocks later input. Signal FIFO is separately bounded32. Rerun needs a new explicit run/consent and new backend UUID; no automatic reconnect or side-effect replay.

## 4. Validation / errors
Strict frontend/backend target grammar, UTF-8 byte limits and noNUL command; backend remains authoritative for wire encoding and native profile. Malformed reply/sequence/stream/byte data or invented remote_exit_code fail closed. Fixed reasons and metadata snapshots contain no private payload. A missing renderer blocks credit, not native cancel; cleanup failure never removes its tab.

## 5. Good / base / bad
Good: run once with explicit consent, independently show stderr tail after stdout EOF, end stdin, send fixed signal, inspect unknown remote result and explicitly rerun. Base: browser component/visual QA proves the rendered workflow, not real Tauri/rshd. Bad: persist the draft in tab/snapshot/history, silently truncate output, ACK on fetch, share PTY clone/reconnect, or release a late reserved handle to a new generation.

## 6. Tests
Behavior tests cover per-command consent/freeze, exact u64 renderer ACK, duplicate delivery, late reserve/start, close barriers, input EOF/signal ordering, real cleanup failure/retry, explicit rerun, byte-cap pause/clear/commit, binary hex/split UTF8, actual component validation/dual-stream render, private lazy workspace ownership, actual IPC arguments and error sanitization, snapshot/AI/history/MultiExec/split traps. Existing Rlogin wire/entry tests remain active. Build/source gates verify lazy chunks; browser theme/layout QA is recorded separately from WebView acceptance.

## 7. Wrong vs correct
Wrong: Array.every accepts a sparse byte vector; correct: iterate every position and reject undefined holes. Wrong: status polling drains a hidden frame; correct: status returns metadata only. Wrong: a full stdout display drops stderr; correct: apply backpressure, retain both native streams and allow cancel/close independently.

Example of the byte-credit boundary (metadata/status polling is separate):

```typescript
const reply = await api.read(privateId, lastRenderedSequence);
if (reply.frame) {
  await renderer.append(reply.frame, runSignal);
  lastRenderedSequence = reply.frame.sequence; // preserve the exact decimal string
}
```
