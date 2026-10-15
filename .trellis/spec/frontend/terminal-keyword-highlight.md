# Built-in terminal severity highlighting

## Scope
WF-09-05D extends the existing semantic highlighter, owned by lazy TerminalPanel. Built-in case-insensitive complete words: error/fatal/fail/failed/failure; warn/warning; success/succeeded/passed. This is lexical highlighting, not a diagnostic classifier. Quoted/negated keywords may still match. User-saved/custom rules are not implemented here.

## Boundaries and priority
Unicode letters, combining marks, numbers and underscore prevent partial-word matches. URLs, dates, IPs and versions retain higher priority, so an error keyword inside a URL/version does not receive separate severity decoration. Physical row matching does not join wrapped words. Buffer content, PTY input/output, selection and session log bytes are never modified.

## Geometry and colours
Map UTF-16 token offsets back to actual xterm cell columns/widths. Skip a token if any participating cell has an explicit ANSI foreground, inverse or invisible attribute. Error/warning/success use the selected terminal scheme red/yellow/green, with existing semantic palette fallback. Theme updates dispose old decorations before redrawing. GUI/light/dark/system validation remains MANUAL_REQUIRED.

## Work and resource budgets
At most 4096 UTF-16 units plus one Unicode code point of boundary lookahead are examined per row, with at most 64 selected tokens. Snapshot construction also bounds text, including long combining cells. No match can extend beyond the scan budget; the limit is not treated as a fabricated word boundary. Whole real output remains available.

Scan viewport before the existing 180-row recent backlog. Retain at most 360 decorated lines and 2048 decorations. Evict non-viewport backlog when visible rows need either budget. Partially decorated signatures are revisited after capacity is freed. Scroll pruning, alternate-buffer changes, markers and disposal release all owned decorations; dispose cancels scheduled refresh and listeners.

## Tests
Ten tests cover literal words/offsets, Unicode boundaries, URL/version/IP precedence, bounded scan/count including the physical-cell cap, scheme colours and actual xterm buffer/decorations (wide-cell geometry, ANSI preservation, theme/alternate-buffer cleanup, output immutability, global cap and full-budget viewport eviction). No renderer is opened; these are not GUI acceptance.
