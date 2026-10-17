# Rlogin bounded frontend delivery

## 1. Scope / trigger

Add typed wrappers and a renderer-independent bridge for the existing numeric-IPv4 runtime. This slice does not mount UI, open a connection, decode text, persist state or enable full terminal capability. Actual command/owner/platform contracts remain backend/rlogin-runtime.md. No public terminal events, logs, macros, history or snapshot registration.

## 2. Signatures

`commands.ts` adds rloginCapabilities/reserve/start/write/resize/read/status/cancel/close with backend DTOs in terminal/rloginTypes.ts. Nested fields retain snake_case; top-level reservationId is camelCase. Decimal u64 strings are never converted to Number. read/status validate wire responses before adoption.

`new RloginBridge(reservationId, client)` owns one canonical UUID-v4 generation. Client methods are read(request), write(request), resize(request), close(id). `poll(): Promise<RloginStatus|null>` coalesces concurrent calls into one native read. `render(write: (bytes: Uint8Array, onParsed:()=>void)=>void): boolean` transfers one ready frame to a sink. `write(bytes): Promise<void>` and resize(window) each allow one in-flight call, returning fixed busy on overlap; there is no hidden input queue. `close(): Promise<void>` invalidates callbacks immediately and waits actual backend close plus all already-issued IPC. A failed close retains the lease and can be retried. `snapshot()` is payload-free local metadata.

The subsequent terminal IO adapter adds client.writeText(request) and bridge.writeText(data); text and raw write share the same in-flight slot and close barrier. Frozen encoding, text limits, bounded keyboard queue and incremental renderer behavior are specified separately in [rlogin-terminal.md](./rlogin-terminal.md). The bridge itself still owns no renderer, hidden queue or loop.

## 3. Contracts

A module-owned set rejects duplicate bridges for the same ID and caps live/closing owners at16; release only after actual close and issued operations settle. Poll is caller-driven (future mounted terminal scheduler); no hidden timer, detached retry loop or unbounded promises. One output frame of at most32KiB can be ready or writing, plus one in-flight read response; input is at most one32KiB call and resize is at most one call.

Frame states are ready → writing → exact ACK pending → accepted by next successful read. While ready/writing, poll with no ACK keeps control/epoch/EOF progressing without freeing backend credit. Only the first matching sink callback makes ACK eligible. Callback after close or from an old frame is inert. Once handed to the sink, the callback retains only frame metadata, not a second byte array; the sink owns the delivered bytes. Poll captures the ACK it actually sends, and must not clear a newer callback's ACK on a late response.

On epoch advance, discard a ready frame and ACK exactly its old epoch/sequence. A writing frame has crossed the renderer ownership boundary; retain its credit until its callback, and never clear already displayed terminal content. Frame-less reset updates epoch before the next data read. Sequence/epoch comparisons use canonical decimal-string length and lexicographic order, supporting u64::MAX. Reject regressing counters, unsolicited/replayed frames, inconsistent reset/credit/finished flags and non-byte or oversized data.

Read failure has ambiguous delivery: the backend might already own a flight whose reply was lost. Do not retry read or replay input automatically. Stop the bridge, invalidate callbacks, initiate close and surface a fixed error. Cleanup failure remains visible as close_failed and is retryable. EOF retains all output through exact ACK; only a finished reply initiates final cleanup. A late reply after close returns null and cannot render or affect a new owner.

## 4. Validation / error matrix

| Condition | Result |
| --- | --- |
| Invalid UUID/canonical decimal/byte/schema | fixed rlogin_bridge_invalid_response or invalid_id; no payload in error |
| Duplicate generation / owner limit / overlapping input or resize | fixed rlogin_bridge_busy before new IO/copy |
| Read/sink/write/resize failure | fixed operation error, stop and close; no automatic replay |
| Backend close fails | fixed rlogin_bridge_close_failed; retain owner until explicit retry succeeds |
| Closed bridge / stale callback | reject new write/resize; poll null; no ACK or render |
| Windows runtime unavailable | actual backend capability/error retained; no frontend fallback provider |

## 5. Good / base / bad

Good: poll one frame, render once, continue control polls while parsing, then send the exact ACK. Base: no renderer is ready; bounded output remains credited. Bad: ACK on receipt, run concurrent reads, convert counters to Number, clear xterm on flush, or retry an ambiguous failed read.

## 6. Required tests

Exercise actual TypeScript bridge and typed wrappers with narrow fake IPC/sinks: >2^53/u64::MAX, bytes and flags, coalesced polls, ready/writing flush and multiple epochs, callback during an outstanding read, duplicate callback, EOF tail, delayed read after close/replacement, close barrier and retry, lease cap, input/resize bounds and failure, malformed/ambiguous responses. Run type-check, frontend tests/build, scripts/source/startup gates and full CI. No UI/real WebView or service interop claims from these tests.

## 7. Wrong vs correct

Wrong: `read(...).then(frame => { queue.enqueue(frame); ack(frame); })`. Correct: retain the sole frame until render ownership and the matching parsed callback; ACK its backend strings on the next serialized read. Wrong: retry after a lost read result. Correct: stop and await owned cleanup, then create a new consented reservation/generation if the user reconnects.
