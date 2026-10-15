# Built-in terminal severity highlighting

## Scope
WF-09-05D extends the existing semantic highlighter, owned by lazy TerminalPanel. Built-in case-insensitive complete words: error/fatal/fail/failed/failure; warn/warning; success/succeeded/passed. This is lexical highlighting, not a diagnostic classifier. Quoted/negated keywords may still match. Saved custom rules are described in the WF-09-05E contract below.

## Boundaries and priority
Unicode letters, combining marks, numbers and underscore prevent partial-word matches. URLs, dates, IPs and versions retain higher priority, so an error keyword inside a URL/version does not receive separate severity decoration. Physical row matching does not join wrapped words. Buffer content, PTY input/output, selection and session log bytes are never modified.

## Geometry and colours
Map UTF-16 token offsets back to actual xterm cell columns/widths. Skip a token if any participating cell has an explicit ANSI foreground, inverse or invisible attribute. Error/warning/success use the selected terminal scheme red/yellow/green, with existing semantic palette fallback. Theme updates dispose old decorations before redrawing. GUI/light/dark/system validation remains MANUAL_REQUIRED.

## Work and resource budgets
At most 4096 UTF-16 units plus one Unicode code point of boundary lookahead are examined per row, with at most 64 selected tokens. Snapshot construction also bounds text, including long combining cells. No match can extend beyond the scan budget; the limit is not treated as a fabricated word boundary. Whole real output remains available.

Scan viewport before the existing 180-row recent backlog. Retain at most 360 decorated lines and 2048 decorations. Evict non-viewport backlog when visible rows need either budget. Partially decorated signatures are revisited after capacity is freed. Scroll pruning, alternate-buffer changes, markers and disposal release all owned decorations; dispose cancels scheduled refresh and listeners.

## Tests
Ten tests cover literal words/offsets, Unicode boundaries, URL/version/IP precedence, bounded scan/count including the physical-cell cap, scheme colours and actual xterm buffer/decorations (wide-cell geometry, ANSI preservation, theme/alternate-buffer cleanup, output immutability, global cap and full-budget viewport eviction). No renderer is opened; these are not GUI acceptance.

## Saved custom rules (WF-09-05E)
### Scope and signatures
`appearance.terminalKeywordRules: TerminalKeywordRule[]` shares the existing `useSettings` / `mxterm.settings.v1` owner. `TerminalKeywordRule = { text: string; kind: "error" | "warning" | "success" }`. `validateKeywordRules(unknown)` returns null or count/text/duplicate/shape. `normalizeKeywordRules(unknown)` returns sanitized copies of valid rules, otherwise an empty list atomically. No xterm runtime import in this lightweight startup contract.

### Contract
Appearance editor uses three lists, one literal per line, with explicit Save and apply / Discard. Empty lines are ignored; all other text is preserved. Max 24 total rules, 64 UTF-16 units per rule. Blank-only, leading/trailing whitespace, control characters, lone surrogates, line separators, invalid kinds and case-insensitive duplicates are rejected. Invalid UI drafts remain visible and cannot save; no silent truncation. Changed saved settings/reset replace drafts; unrelated rerenders do not. Leaving the editor discards unsaved drafts, as disclosed in help.

Rules are ordinary local plain-text settings, not credentials. Help warns against entering secrets. Only rule text/kind persist; terminal output, search query and session IDs never enter the rule model or workspace snapshots. Existing settings storage behavior remains: restricted storage failures are swallowed by the common writer; this feature does not add a durability guarantee.

### Runtime and priority
Both SSH and Local TerminalPanel render sites receive saved rules. Creation compiles escaped literal regexes once; `setRules(readonly TerminalKeywordRule[])` replaces matchers, clears old decorations and refreshes existing output without remounting or writing to the terminal. Custom priority 65 overrides built-in severity 60 but not URL/date/IP/version 70–100. Literal punctuation is never passed through semantic token trimming. Unicode boundaries and case-insensitivity follow built-in rules. Physical-row and decoration budgets above remain unchanged.

### Validation cases
- Good: `[timeout]` matches its literal brackets; `a+b` does not match `aaab`; `retry later` preserves the internal space.
- Base: missing/empty custom rules preserve all built-ins. Clearing all lists and saving removes only custom decorations.
- Bad: 25 entries, 65-unit text, duplicate `timeout`/`TIMEOUT`, padded text or control characters fail validation. Invalid stored config falls back to empty without partially applying rules.

### Required tests
Settings normalize/JSON roundtrip excludes unknown fields. Component tests use the actual settings owner/storage to verify explicit save and remount restore, validation/discard and Appearance reset. Matcher tests cover escaped punctuation and precedence. Real xterm tests change/remove rules against existing output, preserve ANSI cells and confirm buffer text is unchanged. GUI/native/theme acceptance remains MANUAL_REQUIRED.

### Wrong vs correct
Wrong: compile user text as regex, trim punctuation, reconstruct terminal on each edit, or persist transient output. Correct: validate the saved config, compile escaped literals on rule change, invalidate only decorations, and keep drafts separate from applied settings.
