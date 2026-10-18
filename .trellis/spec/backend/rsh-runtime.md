# Rsh main-window IPC and lifetime

## 1. Scope / trigger
S2 command tasks, approved plan S01-S03/C01-C02. No saved connection schema, credential lookup, command persistence, local shell or automatic rerun. Actual Rsh source-port permission is determined by native bind during start; capability describes the implemented runtime, not a successful bind or real-rshd compatibility.

## 2. Signatures
Actual wrappers `rsh_capabilities/reserve/start/write/write_text/stdin_eof/signal/read/status/cancel/close` derive owner from WebviewWindow.label and use managed TaskManager. Reserve DTO denies unknown fields: local_address,target_address,port,local_user,remote_user,command,encoding,run_timeout_seconds,allow_plaintext. Consent checked before encoding/admission; exact bounded command encoded strictly without replacement or trimming. Core freezes the bytes and encoding. Start takes only reservation_id. Top-level ID JSON is camelCase reservationId; nested DTO uses reservation_id.

Write/WriteText take reservation_id,data. Signal takes reservation_id and a snake_case enum (hangup/interrupt/quit/kill/terminate), never a host integer. Read takes reservation_id,ack:null or canonical nonzero decimal u64 string. Frame contains sequence:string,stream:stdout|stderr,data:bytes. Read contains status and optional frame. Status phase/reason/three EOF flags/awaiting_ack/finished always includes remote_exit_code:null. All counters and IDs share canonical legacy_ipc primitives with Rlogin, retaining protocol-specific fixed errors.

## 3. Contracts / resources
All boundaries verify actual main window before core actions; no request-provided owner. Reserve performs no IO, start consumes once. Status never consumes output or removes a handle. Input and output obey rsh-task budgets and true cleanup. Shared app Resources provides the same4 actual worker permits and4 DNS permits to Rlogin/Rsh; each protocol retains its bounded16-handle table. No permission gate uses the unrelated Windows Rlogin urgent capability.

Main-window destruction cancels Rsh too. RunEvent::Exit awaits both legacy managers together with existing services; real DNS/worker/socket completion precedes return. AppError raw_message and visible message contain only fixed codes/text, never target/user/command/output/OS diagnostics.

## 4. Validation / errors
Foreign origin=>rsh_task_denied; missing consent=>rsh_task_consent_required; malformed UUID=>expired; unknown valid UUID cancel/close=>idempotent success. Unknown DTO fields, invalid enum/numeric wire type rejected at deserialize. Noncanonical/zero/future ACK cannot free credits. Strict conversion/size, profile/address, timeout, quota and native errors remain fixed. Invalid original DNS target in saved Rlogin profiles maps through SessionError before its existing config error handler, preserving legacy_socket_invalid_address.

## 5. Good / base / bad
Good: actual main reserves exact command, starts once, renders labelled bytes then ACKs, and closes with a completion barrier. Base: read-only capability/status do not connect. Bad: allow a frontend owner override, send native host signal numbers, turn EOF into exit0, or use status via read.

## 6. Tests
Production DTO/Boundary tests in the three-platform harness cover owner/consent/unknown fields, exact command and GBK conversion, loss/size/timeout/address rejection, all five signals, decimal-u64 boundaries, labelled binary output and permanent unknown exit code. Shared quota test instantiates actual Rlogin and Rsh managers. Full application CI verifies Tauri registrations/wrappers/Exit and the saved-profile error mapping; harness alone cannot prove those call sites compile. Real WebView and rshd remain separate acceptance.

## 7. Wrong vs correct
Wrong: give a shared resolver a protocol-specific code() and leak one protocol's DNS error into another. Correct: shared ResolveError, explicit per-protocol conversion at every boundary, including saved-profile validation. Wrong: cancellation response means complete; correct: close/Exit await actual owned resource completion.
