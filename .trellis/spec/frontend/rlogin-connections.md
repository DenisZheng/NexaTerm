# Rlogin configuration and terminal entry

## 1. Scope / trigger

Approved WF09-08A L01-L03/C01-C02, WORKFLOW_SPEC v0.7 WS-P01/P02/P04 and WS-R01/R02. Extend the existing mother prototype first, then the existing lazy ConnectionDialog and terminal surfaces. Backend config/storage is PR75; a saved profile does not authorize plaintext IO.

## 2. Signatures

TS ConnectionProtocol adds rlogin and Profile/Input carry optional RloginConnectionConfig: local_address/local_user/terminal/speed. Remote target/port/user remain host/port/username; encoding remains advanced.terminal_encoding. Default port513, terminal xterm-256color and speed38400. No stored consent, reservation ID or input/output.

Pure connectionForm.ts owns existing formFromConnection, duplicateFormFromConnection, normalizeForSubmit and protocol config defaults. Characterization tests preserve old five protocols before adding Rlogin. Both dialog submit and useConnections normalization require an explicit Rlogin branch; protocol switches clear incompatible configs/auth, imports must never fall through to SSH.

## 3. Contracts

Reuse shared Radix/AppSelect/Lucide, form classes and --mx-* tokens. Numeric IPv4 and separate local/remote users are explicit. No fake successful connection test in browser preview. Save works without a platform IO capability; connection permission and capability apply when starting. Runtime capability remains disabled until the actual owner/renderer is connected.

Each attempt freezes deep target/config/encoding/window before transient consent. Cancel/reconnect/close belong to the workspace instance rather than pane mount. Late reserve after cancel only closes the old UUID. Cleanup failure retains visible ownership and retry. Reconnect obtains new consent after actual old cleanup. Restore never restores authorization or starts IO automatically. Input text/raw shares one bounded owner; output bypasses public events/log/history/MultiExec and returns credit only after parsing/disposal.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Invalid required configuration | text error; no silent target substitution or truncation |
| Unsupported platform / low-port permission | actual backend reason; no auto elevation or high-port fallback |
| Save | only metadata; no reserve/start/consent |
| Cancel/late IO | generation isolation and actual cleanup |
| Cleanup failure | retain retryable owner and tab |
| EOF / ACK | no fabricated remote success or authenticated state |

## 5. Cases

Good: load/copy/save exact Rlogin config independently of SSH credentials; explicitly permit one frozen target. Base: preserve SSH saved-user backfill, desktop passwords, Telnet/Serial data isolation and duplicate metadata reset. Bad: fall through to SSH, persist allow_plaintext, or dispose renderer and silently drop a still-owned failed-close instance.

## 6. Tests

Old form characterization, Rlogin normalization/no mutation, prototype DOM flows, real form field and submit behavior, no fake test success, generation/cancel/late reserve/close retry/reconnect/restore races, credited renderer and mixed input bounds. Types/build/startup/source gates and full CI; native WebView focus/GUI/theme/rlogind acceptance stays separate from DOM/unit results.

## 7. Wrong vs correct

Wrong: grow frozen ConnectionDialog with a second copy of all conversion code. Correct: extract existing pure helpers first, keep call sites, characterize behavior then extend the independent branch. Wrong: reuse current public terminal close or output queues for the Rlogin UUID. Correct: workspace retains the dedicated owner through actual cleanup.
