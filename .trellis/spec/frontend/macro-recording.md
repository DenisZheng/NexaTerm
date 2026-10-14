# Explicit macro recording and privacy

## 1. Scope / Trigger
WF-09-04B adds memory-only recording to the reviewed replay flow. Rules: WS-X03/04/05/07/08 and WS-F08. Record only explicitly submitted complete commands from existing send actions, after delivery to one explicitly selected source session. Do not subscribe to raw terminal input or output for macro capture.

## 2. Signatures
- `createMacroRecorder(resolveTarget, now)` owns a source, generation, bounded pending queue and immutable UI snapshot.
- `start(target)` validates the current key/session; `begin(command, appendEnter, targetKeys)` returns a command-free ticket; `finish(ticket, written)` admits confirmed delivery in submission order.
- `stop`, `clear`, `reconcile`, `dispose` revoke pending generations and release owner state.
- `omitAutomaticHistory(targetKeys)` exposes a source-scoped privacy latch.
- `isSensitiveCommand` filters known inline secrets; `shouldPauseMacroCapture` additionally covers common authentication prompts.
- Existing native `terminalWrite(sessionId, data)` remains the only I/O command. No new IPC, schema, dependencies or Rust code.

## 3. Contracts
The source is pinned to its concrete session. Source changes never follow focus or reconnect. Sender writes also use `resolvePinnedMultiExecTarget`, so queued intents cannot silently move to replacement sessions. Confirm source delivery immediately after its own native write, without waiting for other recipients. Deliveries to other sources cannot enter this draft.

Sanitize before enqueueing: known sensitive commands and authentication-prompt commands become empty `masked=true` entries and pause new capture immediately. Successful delivery admits the placeholder; failure admits none. Subsequent authentication answers cannot enter this paused recording. Detection is conservative and heuristic; false positives and unrecognized sensitive values require user review.

The same known-pattern filter protects automatic history. A paused recording additionally latches history suppression for its source until clear/new recording/owner release. Sender captures that decision before awaiting native I/O, so clearing or restarting cannot publish a late authentication answer. Optional terminal history checks the latch before assembling input and after delivery; suppressing history never drops actual terminal I/O or live input. Explicit snippet use counts remain independent of history suppression.

Pending and accepted steps share replay limits from `macroLimits.ts`: 20 steps, 16 KiB each, 64 KiB aggregate, 60 s per gap and 300 s aggregate. Gaps use monotonic submission times, not completion order. Excess delay is not shortened. Stop discards unresolved tickets and preserves confirmed steps. Stop/clear/restart invalidate late callbacks.

Source selection starts empty. Start opens the existing Sender with explicit targets; start itself performs no writes. Stop/edit copies sanitized steps into MacroDialog. Every masked step must be explicitly replaced or removed before a fresh preview. Replay still uses independently reviewed explicit targets. Closing editor, hiding the owner bar or unmounting discards memory state. Do not send drafts/tickets/keys to history, snippet, snapshot, export, logs or diagnostics.

## 4. Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| No explicit current source | Cannot start |
| Other target sends | No capture |
| Partial send without Enter | Stop, no assembled command |
| Sensitive/authentication command | Immediately pause; omit text, admit empty placeholder only on source success |
| Failed source write | Stop, preserve prior confirmed steps |
| Source disconnected/replaced | Stop; no new-session substitution |
| Reordered acknowledgements | Ordered admission by submission ticket |
| Step/size/delay limit | Stop with existing confirmed steps; no truncation |
| Stop/restart/clear before completion | Stale ticket ignored |
| Unfilled masked step | Preview error `sensitive`; no write |

## 5. Good / Base / Bad Cases
Good: record source A, send to A/B, admit only A; stop while B is pending and keep A's confirmed step. Base: `pwd` with Enter produces a zero-delay first step. Bad: saving a password-like command before its native response, reading arbitrary xterm keystrokes, or treating focus as source selection.

## 6. Tests Required
Model tests cover exact text, order, generation revocation, source replacement, masked queue/privacy latch, failure, partial sends, aggregate budgets and cleanup. UI tests cover explicit source selection, no input on start, masked editing, draft disposal and unmount. Script tests execute actual Sender and terminal onData handlers to prove IPC-time suppression, late completion, history independence, no session replacement and preserved terminal I/O. Startup source checks keep editor/source dialogs and replay runner lazy.

## 7. Wrong vs Correct
Wrong: filter only after capturing plaintext, or read history-suppression state after a pending write completes. Correct: omit sensitive text before enqueueing, capture the history decision at submission, and recheck the pinned source before admitting success. Heuristic matching is not proof that every command is secret-free.
