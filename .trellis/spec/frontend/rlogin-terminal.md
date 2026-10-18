# Rlogin terminal IO adapter

## 1. Scope / trigger

Implement encoding, bounded keyboard/paste delivery and a renderer lifecycle adapter over the credited bridge. This engineering slice precedes the saved connection model and mounted terminal UI; terminal_available remains false. WS-P01/P02/P04 and WS-R01/R02 remain the product authority. No public terminal output, SessionLogs, history, macros, MultiExec, DNS or persistence.

## 2. Signatures

Reserve adds optional `terminal_encoding` (default `utf-8`), frozen with the generation. Accepted labels are exactly the eight existing ConnectionTerminalEncoding values. `rlogin_write_text(request:{reservation_id:String,data:String}) -> Result<(),AppError>` uses the frozen backend encoding; no encoding/target/owner override. It shares main/platform/UUID guards with raw write. Raw write remains available for explicit protocol bytes. SessionManager.write_text(origin,id,data) encodes then atomically enqueues through the same bounded input queue.

`RloginBridge.writeText(data:string):Promise<void>` shares the one in-flight input slot and close barrier with write(bytes). `RloginTerminalController(bridge,encoding)` exposes `tick()`, `send(text)`, `resize(window)`, `attach(renderer)`, `close()` and a payload-free `snapshot()`. A renderer provides write(text,onParsed) and synchronous dispose(). attach returns an idempotent detach that disposes the renderer before explicitly discarding its outstanding parser write. tick is caller-driven and coalesced; the adapter owns no timer, React state or public event listener.

## 3. Contracts

Text input IPC accepts at most4096 UTF-8 bytes, encoded output at most32KiB; invalid encoding/unrepresentable text rejects with fixed codes, never replacement or HTML references. Encoding is validated before reservation admission and retained after start consumes the target request. No Debug or error includes input text. Use the application's pinned encoding_rs, no new application dependency.

Frontend preflights a whole input call before enqueueing any of it, rejects unpaired surrogates, splits only at code point boundaries into <=4096 UTF-8 bytes, and caps queued plus in-flight input at128KiB/256chunks/256calls. One native write at a time; native success means queued bytes, not remote execution. Overflow/invalid text or ambiguous write failure stops the generation and discards pending input visibly, without automatic replay or truncation. Close rejects queued callers immediately, invalidates new input and awaits bridge cleanup and the issued input/resize runners. Latest resize is one pending immutable value plus one issued call, no unbounded promises.

Output uses TextDecoder with fatal=true and ignoreBOM=true, incrementally per generation and exact decimal epoch. Reset decoder state on every observed epoch change before new data; a flush intentionally discards an incomplete old character, never clears displayed text. EOF finalization rejects incomplete/invalid tails. A decoded empty chunk may ACK immediately because its bounded suffix is held by the decoder. Nonempty text ACKs only after the matching renderer callback. Retain no second output queue or recent-output projection. This credited path is the Rlogin-specific alternative to TerminalOutputQueue.

Preserve C0/DEL as terminal controls outside text decoding (some runtime Shift-JIS decoders remap DEL). ISO-2022-JP requires a streaming terminal-aware scanner: recognized encoding designations enter the decoder, VT ESC/CSI/OSC/DCS controls reach the renderer, JIS state survives ANSI controls, and no growing control-string payload is buffered. Only at most two undecided ESC-prefix bytes are retained; incomplete prefixes fail at EOF and reset on flush. Native ISO text input similarly preserves ESC/SI/SO bytes instead of accepting the text encoder's replacement path. This is terminal framing, not filtering visible output.

Only one attached renderer. Old callbacks after detach/close cannot ACK a replacement frame. Detach calls actual synchronous renderer disposal first; only then can its pending write be explicitly discarded/ACKed. A disposal failure stops the generation. A controller survives renderer detach/remount; the future workspace owner must close it on session close/reconnect, not merely on pane movement. No reconnect reuses a controller/UUID or a previous plaintext consent.

## 4. Validation / error matrix

| Condition | Result |
| --- | --- |
| Unsupported/fake encoding label | rlogin_encoding_invalid before reserve admission |
| Native text >4096 bytes / encoded >32KiB | rlogin_session_invalid_chunk, no enqueue |
| Unrepresentable input | rlogin_encoding_failed, no replacement/enqueue |
| Invalid JS Unicode / input budget exceeded | fixed terminal input error, stop and close |
| Invalid output or truncated EOF suffix | rlogin_terminal_decode_failed, stop and close |
| Duplicate renderer | fixed terminal renderer busy, existing owner retained |
| Read/write/resize/render/dispose failure | fixed error, close, no retry/replay |
| Cleanup failure | retain bridge owner, explicit close retry remains possible |

## 5. Good / base / bad

Good: a GBK character split across two frames becomes one character and each frame is ACKed only after parsing or bounded decoder consumption. Base: no renderer attached, the sole raw frame stays credited while control polls proceed. Bad: decode each frame independently, silently substitute characters, split surrogate pairs, queue every keystroke in an unlimited promise chain, or ACK before actual renderer disposal.

## 6. Required tests

Native: eight labels/strict rejection/default, exact GBK/Big5/Japanese/Korean/control bytes, encoding failure and limits, frozen encoding after start, shared byte queue and no mutation on errors, main/platform/UUID/unknown-field guards, real socket text delivery. Frontend: split multibyte/BOM/stateful decoding, flush/EOF tails, parse and detach callbacks, coalesced polls, single-flight input/paste preflight and budgets, latest resize, close with outstanding operations, cleanup retry, raw-error isolation and actual typed wrapper arguments. Run full type/tests/build/source gates plus three-platform native and application CI. These tests do not prove mounted UI, real WebView or rlogind interoperability.

## 7. Wrong vs correct

Wrong: TextEncoder for GBK, decoder.decode(frame) without stream, send(text).catch(()=>{}), or renderer cleanup that ACKs before dispose. Correct: freeze the selected encoding at reserve, use strict backend encoding, keep a bounded incremental decoder, fail visibly on delivery uncertainty, and discard only after renderer disposal. Never put this IO through log/history/broadcast hooks.


## Mounted input extension

`RloginInputQueue.sendBinary(data:string)` accepts xterm binary strings only when every UTF-16 code unit is0..255. Preflight the whole call, count actual raw bytes and chunk at32KiB. Text and binary share the same128KiB/256chunk/256call budget, ordered single pump and actual close barrier. Never text-encode mouse/control bytes or call bridge.write concurrently outside that owner. Controller.sendBinary delegates to this same queue; invalid raw input/overflow closes the generation before partial admission.
