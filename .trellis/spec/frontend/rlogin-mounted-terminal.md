# Rlogin mounted terminal boundary

## 1. Scope / trigger

Continue PR76 components into the actual workspace/TerminalPanel, WS-P01/P02/P04 and WS-R01/R02. First define and test the private renderer binding, then integrate the existing lazy panel and instance owner. No capability activation until actual entry/render/cleanup paths are connected.

## 2. Signatures

`mountRloginTerminal(surface,adapter,{canResize,onFailure}) -> () => void`. Surface is the xterm write/dispose/onData/onBinary/onResize/cols/rows subset. Adapter supplies the dedicated controller and `inputAvailable():boolean`; optional requestReconnect belongs to the workspace. This module imports controller types only and owns no public terminal events, native UUID, timer, output/history/log queue or connection creation.

## 3. Contracts

Attach the one credited renderer; pass each decoded string directly to surface.write(text,onParsed). Text events go synchronously into controller.send, byte-string events into controller.sendBinary, so both use the existing shared bounded input owner without an extra promise queue. No Telnet newline/escape rewriting. Check input availability and disposed state before admission. Resize uses current window only when ready/active and delegates existing latest-value merging. Fit/search/theme stay in the existing panel.

Cleanup is idempotent: first invalidate all callbacks, dispose input/binary/resize handlers, then detach controller. The controller performs actual surface.dispose before explicit discard/ACK. Pane detach never closes the workspace owner; late input/resize/parsed callbacks cannot affect the next renderer or generation. Attach failure disposes only the newly created surface and leaves an existing renderer intact. Fixed failure codes contain no text or output.

The actual TerminalPanel branch must occur before TerminalOutputQueue/startup/public listeners/history/macro/directory wiring and must bypass generic status/autoConnect/reconnect/initialOutput callbacks. Keep native sessionId empty, logging unsupported and no automatic reconnect on Enter. Controller has one renderer; workspace movement changes attachments, not transport ownership. Detailed inspected seams are recorded in research/mounted-entry-seams.md in the parent slice.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Not ready / disposed | no input or resize admission, no replay |
| Input/byte invalid/full/failure | existing controller fixed error and cleanup; no public-provider fallback |
| Renderer in use | dispose only rejected new surface, retain prior attachment |
| Surface disposal failure | existing controller renderer_failed, stop generation |
| Native close failure | workspace retains owner/visible retry, pane helper does not delete it |

## 5. Cases

Good: render a frame once, parse it, return exact credit; detach disposes before discarding an outstanding write. Base: switching appearance and search keeps existing xterm features. Bad: pipe native output into public TerminalOutputQueue or send binary strings through text encoding.

## 6. Tests

Execute real bridge/controller with a narrow xterm surface: direct credited write, parse/cleanup ordering, old callbacks, no private data in errors, input text/raw ordering and readiness gating, active resize, duplicate renderer rejection, failed dispose. Follow with actual TerminalPanel, workspace generation/close/reconnect/restore/privacy integration and full CI. Actual TerminalPanel and workspace entry now implement these contracts; helper/component tests still do not prove native WebView or real rlogind interoperability.

## 7. Wrong vs correct

Wrong: call bridge.write directly from onBinary while keyboard uses another queue, or close a session from pane unmount. Correct: one input owner for both paths; workspace alone awaits actual close before removing an instance.
