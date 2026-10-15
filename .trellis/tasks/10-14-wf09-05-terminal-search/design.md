# Design

## Existing implementation and defects
`TerminalPanel` already owns the official SearchAddon and token-derived decorations, and `WorkspaceShell` stores transient search state by tab. SearchAddon 0.16 assigns `lastSearchOptions` before its option comparison; a same-query mode change can keep old all-match decorations (reproduced against the installed addon and real xterm buffer). Its result count is capped at the highlight limit, so reaching 1000 must be reported as “at least 1000”, not an exact total. The current `.trim()` guards also prevent literal whitespace-only searches.

## Ownership and contracts
- Extract workspace search state/actions into a light React hook. Keep tab IDs as owners, prune closed tabs, use monotonic request IDs, and guard late actions against removed tabs. No xterm/IPC imports in this hook.
- Keep query, open, caseSensitive, wholeWord in workspace memory only; no schema change. Existing case matching defaults false, whole-word defaults false.
- A small terminal search controller owns SearchAddon result subscription, active intent, a bounded debounce timer, invalidation, result state, and disposal. It receives only search/selection APIs and token decoration options, never native input APIs.
- Intents: `{open, query, caseSensitive, wholeWord}`. Results: idle, pending, no-match, matches with index/count, limit, too-long, unavailable. Query length over 1024 UTF-16 code units is rejected visibly without rewriting the input.
- Invalidate decorations before querying changed modes, query, or theme. Debounce edits by 120 ms; explicit next/previous flush pending work once and use the exact current intent. Clearing/closing disposes queued work and suppresses obsolete result callbacks.
- Literal mode sends the query unchanged. Whole-word mode escapes every query metacharacter and generates only fixed single-character boundary assertions around that literal. This avoids the installed addon's `wholeWord` engine returning early when the first candidate is a partial word, losing later matches on the same line. No user regex option or dependency patch is added. Word separators follow the addon's punctuation convention plus whitespace; underscore and Unicode letters remain word characters. Unsupported WebView regex engines return unavailable safely; platform GUI verification remains pending.
- Counts at the highlight limit are lower bounds. The controller must not publish intermediate zero-count events before it knows the search return value. Preserve live-output updates through the official addon.

## UI and lifecycle
Extract the existing bar without changing its entry point or visual system; add a Lucide whole-word toggle and use existing Tooltip/button/token classes. The absent `ui-ux-pro-max` capability was already established in the preceding cuts; this task reuses the current approved UI without a visual redesign. Maintain floating placement, fit within narrow panes, and use global material/shadow tokens.

Closing search clears the addon and selection. Only a transition from open to closed may return focus to the active terminal; background query changes must not steal focus. On terminal disposal clear the search subscription/timer before xterm. Opening focus animation is cancelled on close/unmount. Search remains available for a disconnected terminal's existing buffer, and only terminal-backed instances expose its existing action. The workspace consumes each navigation request after handling, preventing an old action from replaying if the panel remounts; a late acknowledgement cannot remove a newer request.

## Compatibility and rollback
No Rust, session event, PTY, terminal output queue, workspace snapshot, or command-history changes. Existing search entry points and prop defaults remain compatible. Rollback restores this frontend slice alone; log capture remains independently implementable.
