# Reviewed macro replay

## 1. Scope / Trigger
WF-09-04A extends the existing MultiExec input surface. Product rules: WS-X03/04/05/06/07/08. Explicit command recording is covered by [macro-recording.md](./macro-recording.md). Persistence and import/export remain follow-up slices.

## 2. Signatures
- `createMacroPlan(steps, targets)` returns an immutable plan or a validation code.
- `runMacro(plan, runtime, signal, onDelivery)` returns `completed | cancelled | failed` and delivery records.
- Runtime uses `resolveCurrentMultiExecTarget(key)` and the existing typed `terminalWrite(sessionId, data)` through `writeMultiExecCommand`.
- No new IPC, Rust, database or snapshot schema.

## 3. Contracts
A preview copies exact commands and pins each explicit target key to its current session id. Each step appends CR and waits its own delay before sending. Targets and steps are serial; focus changes do not modify the plan. Every write re-resolves the key and compares the pinned session id. Failure stops all remaining writes with no automatic retry.

Limits: 1–20 steps, 1–20 distinct sessions, 16 KiB UTF-8 per command, 64 KiB total, integer delay 0–60000 ms, total delay ≤300000 ms. Reject blank commands and C0/C1 controls except LF/tab. Preserve command whitespace. Delivery records contain only step/key/status, never raw native errors or commands.

The editor and runner are lazy-loaded from MacroLauncher. Opening stops live input and closes Command Sender. Preview is consumed synchronously on confirmation, so duplicate activation cannot replay it. A fresh preview is required for another run.

A recorded `masked=true` step returns validation code `sensitive` until explicitly replaced or removed. Draft, preview, runtime identity and results are memory-only. Do not call history, snippet, snapshot, export, storage or diagnostic APIs. Closing discards the draft. Future recording must separately address sensitive input; this slice does not capture raw keystrokes.

## 4. Validation & Error Matrix
| Condition | Result |
| --- | --- |
| Invalid size, command, delay, targets | Validation code; no runnable preview |
| Target absent at confirmation | Stop before any input |
| Target closes/reconnects during delay or dispatch | `disconnected`; never substitute the new session |
| Native write rejects | `failed`; raw error excluded |
| Native write exceeds 30 seconds | `timed_out`; delivery unknown, no retry |
| Cancel while waiting | Clear timer/listener; no further writes |
| Cancel while native write is pending | Wait for result or timeout, retain known delivery, stop remaining writes |
| Close/unmount | Abort future work, suppress state callbacks; an already submitted native write cannot be recalled |

## 5. Good / Base / Bad Cases
Good: preview sessions A/B, change focus to C, replay only pinned A/B. Base: one `pwd` step produces `pwd` plus CR. Bad: resolving only by profile id or replacing a disconnected session silently.

## 6. Tests Required
Engine tests cover immutable exact preview, byte/control/limit validation, delay/order, target replacement, preflight, failure, cancellation during wait/write, timeout and late rejection cleanup. Dialog/launcher tests execute real preview-confirm flow under StrictMode, duplicate activation, cancel/close/unmount, safe errors, selection change and draft disposal. Startup source gate protects lazy loading. Real terminals and Light/Dark/system-dark remain manual evidence.

## 7. Wrong vs Correct
Wrong: treat write success as remote execution success, log rejected native errors, or automatically retry a timeout. Correct: report only terminal input delivery and require a new explicit preview/confirmation after reviewing outcomes.
