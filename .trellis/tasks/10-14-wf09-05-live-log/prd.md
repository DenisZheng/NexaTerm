# WF-09-05C Explicit live logging
User flow: in an SSH/Local terminal, choose Start log, acknowledge sensitive output/UTF-8/100 MiB policy, choose a new destination, observe recording state, and stop. Closing/disconnecting stops capture; reconnect never transfers it.

Approved WF-09-05, same PR #62, parent 09-23 only. WS-M02, WS-X02, WS-R01. Baseline a046b8c CI #591 all seven executing jobs passed. Manual acceptance remains deferred by user.

Acceptance: LC01 explicit warning and create-only path, cancel has no side effects; LC02 pinned live session and capture ID, stale async callbacks cannot start another instance; LC03 bounded worker queue and global worker count, no file I/O/wait in terminal output path; LC04 stop/drain/limit/overflow/I/O/invalid UTF-8 states visible and no terminal output changes; LC05 disconnect cleanup and no automatic restart; LC06 bilingual shared controls/tokens, lazy terminal boundary, no output/path in snapshots or diagnostics. Capture only future output including remote echo, ANSI/control sequences; no promise of secret redaction.
