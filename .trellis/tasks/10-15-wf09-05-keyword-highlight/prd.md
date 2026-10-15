# WF-09-05D Bounded severity keywords
User flow: read uncoloured log output in an existing terminal; complete error/warning/success keywords receive the selected terminal scheme colours without changing output, input, selection or captured logs.

Approved WF-09-05 keyword highlighting, parent 09-23 only; WS-M02, WS-X02, WS-R01. This cut adds built-in severity rules, not saved custom rules or a settings schema. Baseline c4e3102 CI #592 all seven executing jobs SUCCESS. Manual acceptance remains deferred.

Acceptance KH01: literal whole keywords, case-insensitive, Unicode-aware word boundaries, existing URL/date/IP/version precedence. KH02: ANSI foreground/inverse/invisible cells are untouched and wide characters use real cell positions. KH03: selected terminal red/yellow/green palette, theme refresh clears old decorations. KH04: bounded input scan, per-line tokens, retained lines and global decorations; viewport prioritized. KH05: alternate buffer/clear/dispose free resources and cancel timers; no write, logging, persistence or new dependencies. Real GUI/three-theme acceptance remains MANUAL_REQUIRED.
