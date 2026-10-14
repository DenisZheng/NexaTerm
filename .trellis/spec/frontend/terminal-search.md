# Terminal search and highlight lifecycle

## 1. Scope
WF-09-05A extends the existing SearchAddon search bar; WS-E01, WS-M02, WS-X02 and WS-R01 apply. No PTY write, output filtering, session log capture, saved keyword rules, or persisted schema is introduced.

## 2. Signatures and owners
- `useWorkspaceTerminalSearch(terminalTabs, localTerminalTabs)` owns `{open, query, caseSensitive, wholeWord}` by runtime tab ID. Only existing SSH/Local terminal instances can acquire state. Closing a tab prunes intent and pending navigation; stale callbacks cannot restore it.
- `createTerminalSearchController(addon, terminal, onResult)` exposes `configure(intent, decorations)`, `navigate(direction)` and idempotent `dispose()`; its terminal port only exposes `clearSelection`. SearchAddon and renderer remain owned by the lazy TerminalPanel.
- Navigation requests carry `{tabId, direction, id}` with a monotonic sequence. `acknowledgeTerminalSearchNavigation` removes only that exact current request, preventing replay after panel remount and protecting newer requests from late acknowledgements.

## 3. Query and result contracts
Queries stay exact and literal, including spaces and punctuation. Empty means length zero, not trim-to-empty. The shared query limit is 1024 UTF-16 code units; oversized input stays visible and is rejected, never truncated. The unified action policy and bar both disable its navigation.

Whole-word matching escapes all input metacharacters and generates fixed one-character boundary assertions; there is no arbitrary user regex mode. Separators follow SearchAddon punctuation plus whitespace; underscore and Unicode letters are word characters. The wrapper avoids the installed addon's wholeWord engine skipping later valid candidates after an earlier partial candidate on the same line. WebViews without the required regex support report unavailable safely; real platform acceptance remains required.

Results are `idle | pending | no-match | matches(index,count) | limit | too-long | unavailable`, with no query/error text. At the 1000-highlight cap the total is a lower bound, even if exactly 1000 were collected. Result events during find* are published only after its boolean return. Official parsed-output updates continue while a valid intent is ready; old events during debounce or after close are ignored.

## 4. Validation and cleanup
| Trigger | Required behavior |
| --- | --- |
| Query, case, word mode or token palette changes | Invalidate old cache/selection/decorations, debounce for 120 ms |
| Explicit next/previous during debounce | Cancel timer and search once with current intent |
| Empty or closed | Cancel pending work, clear selection and decorations, publish idle |
| Too long | No search; too-long status and action reason |
| Addon failure | Clear stale output, unavailable without opaque error; query change retries |
| Owner dispose | Cancel timer, remove result and palette/media listeners before xterm disposal |

Always invalidate before a same-query mode change: SearchAddon 0.16 sets its last options before comparing them, so passing new options alone can leave old highlights/counts.

## 5. UI and themes
Use the existing TerminalSearchBar, Tooltip, Lucide and global `--mx-*` classes. Enter/Shift+Enter navigate; Escape from any control closes; composing/keyCode 229 events do neither. Opening schedules one cancellable focus frame. Only an open-to-closed transition may refocus the active terminal.

Read computed palette tokens from the terminal host's inherited scope, not documentElement alone (dark tokens can be on body/app-shell). Produce #RRGGBB colors through the existing adapter. Observe global scope attributes and system color-scheme changes, disconnecting both on teardown. Terminal's own color scheme remains independent.

## 6. Required evidence
- Real xterm buffer/addon tests: same-query option changes, candidates after partial words, punctuation, spaces, cross-row CJK matches, navigation, lower-bound cap and live-output cleanup. Only the unopened renderer selection surface is supplied; these tests do not prove GUI rendering or native interoperability.
- Controller lifecycle: debounce/flush once, close/dispose, overlong query, palette refresh and safe error retry.
- Workspace owner: per-instance isolation, closed-tab stale callback rejection, same-millisecond request IDs and exact acknowledgement.
- Bar: composition, keyboard/buttons, preserved input, accessible toggles, status i18n and focus cancellation. Palette tests: aliases/cycles/RGB, host scope and system/global subscription cleanup.
- Required static/type/build/full test gates. GUI/protocol and light/dark/system acceptance stay MANUAL_REQUIRED until the user's unified acceptance batch.

## 7. Wrong vs correct
Wrong: trim the query, use the addon's unmodified wholeWord flag, or interpret a capped count as a complete total. Correct: preserve input, use only an escaped bounded literal pattern for whole-word mode, invalidate caches and report the cap as a lower bound. Search state must never enter workspace snapshots, automatic command history, diagnostics or session logs.
