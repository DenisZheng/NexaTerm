# Rlogin attempt ownership

## 1. Scope / trigger

Own one logical workspace instance across consent, reserve/start, pane changes and retryable cleanup. This owner is a component below the pending mounted UI; do not activate terminal_available before the real renderer/entry is wired.

## 2. Signatures

RloginAttemptOwner(client,requestConsent) exposes connect(profile,window), cancel(), close(), subscribe(listener), getSnapshot(), getController(). Client extends RloginClient with capabilities/reserve/start. Consent receives a frozen non-sensitive RloginTarget and AbortSignal and returns one boolean. Snapshot is a cached immutable {generation,phase,reason}; phase is idle/checking/consent/reserving/starting/initial_exchange_ready/closing/closed/cancelled/failed/cleanup_failed. It contains no UUID, profile, input or output.

## 3. Contracts

Freeze target/user/encoding/window before async work. Check actual terminal/runtime availability before consent. Coalesce concurrent connect calls; a new generation awaits old actual cleanup. Cancel invalidates immediately and aborts consent. Once a UUID is owned it issues actual close immediately to cancel native start (start awaits ACK), then waits both start and cleanup before releasing ownership; an unresolved reserve must return its UUID before it can be closed. Recheck cancellation after synchronous state publications before reserve/start, because subscribers can cancel in that publication. Late reserve is only closed. Controller is created for that one UUID; close failure retains it/id, blocks replacement and allows retry. Neither ACK nor EOF implies authentication or command success.

After start, use one cancellable25ms timer and coalesced controller.tick; no interval or unbounded microtask polling. Poll even when no renderer so control/status can progress; one credited output frame remains bounded. Publish only changed phase/reason/generation and return the same snapshot reference otherwise. Close stops the timer immediately and awaits native and issued calls. Native failures use known finite reason codes; never publish error messages, output or raw payloads. The UI consent implementation must settle on AbortSignal; owner cancellation also settles its own wait so a stale consent callback cannot authorize IO.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Unsupported capability | failed/fixed unavailable; no consent/reserve |
| Declined or cancelled consent | cancelled; no reserve/start |
| Cancel while reserve pending | close returned old UUID; never start |
| Cancel while start pending | no adoption/polling; wait start then cleanup |
| Cleanup failure | cleanup_failed; retain same UUID/controller; replacement blocked |
| Invalid read/render/input | existing controller closes; retain cleanup retry on failure |
| EOF | closed or actual fixed failure; no fabricated exit code |

## 5. Cases

Good: cancel an issued reserve, wait its UUID and close it before any new generation. Base: repeated close shares one promise; unchanged polling produces no UI notifications. Bad: remove the tab first, lose an unclosed lease, reuse consent or allow a stale poll to update a newer generation.

## 6. Tests

Deferred capability/consent/reserve/start/close and stale callbacks; target freezing; capability rejection; consent decline/abort; late reserve; close failure/retry blocks reconnect; one timer/poll; cached snapshots; renderer/control failures; EOF semantics. These tests are owner behavior, not real WebView or rlogind acceptance.

## 7. Wrong vs correct

Wrong: pane useEffect cleanup closes a public terminal session or drops an unresolved reserve. Correct: workspace retains owner and only removes a logical tab after dedicated actual close succeeds; pane only detaches the credited renderer.
