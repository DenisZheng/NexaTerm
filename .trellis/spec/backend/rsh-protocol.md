# Native Rsh protocol core

## 1. Scope / trigger

WF-09-08B S0 under approved plan section6 and S01-S03/C01-C02; WORKFLOW_SPEC v0.7 WS-P01/P02/P04 and WS-R01/R02. Native byte implementation with no external client, local shell, new dependency, IPC or advertised UI capability. Base BSD profile; Kerberos/encrypted variants excluded. Official protocol source: https://man.openbsd.org/OpenBSD-5.3/rshd.8 .

## 2. Signatures

`encode_secondary_port(port:u16)->Result<Vec<u8>,ProtocolError>` requires512..1023 and encodes decimal ASCII+NUL. `encode_command(local_user:&str,remote_user:&str,command:&[u8])->Result<Vec<u8>,ProtocolError>` encodes local-user NUL remote-user NUL exact-command NUL. DEFAULT_PORT=514, MAX_USER_BYTES=16, MAX_COMMAND_BYTES=65536, rejection limit1024.

`Handshake::new/receive/end_of_stream` reuses the existing internal NUL-status/count-only parser, maps failures to Rsh-specific fixed codes and returns borrowed accepted stdout tail. `validate_secondary_peer(peer:SocketAddr,expected:Ipv4Addr)` requires exact frozen IPv4 and source port512..1023. `Signal::{Hangup,Interrupt,Quit,Kill,Terminate}.encode()->[u8;1]` uses BSD1/2/3/9/15, independently of host OS values.

## 3. Contracts

No leading Rlogin-style NUL before the callback port. Build/bind the reserved stderr listener before sending that port. Native S1 verifies callback against the numeric main destination; reject/close spoofed candidates with bounded attempts/deadline. Only after valid callback send users and command. S0 pure validators do not open or authorize network IO.

User strings nonempty<=16 UTF-8 bytes with no control/NUL; local/remote independent and not silently trimmed/truncated. Command1..65536 raw bytes excluding NUL; preserve whitespace/newlines/binary bytes, no interpolation/local execution. Cap application allocation before creating payload. Other service ARG_MAX/username profiles can reject honestly; do not claim universal server compatibility.

Zero status accepts initial exchange only. Preserve every coalesced stdout byte includingNUL/FF; never interpret stderr data as status or strip its first byte. Rejection is counted/discarded throughLF/EOF with cap1024; no raw server message retention or payload in errors. Parser error sticky; do not reuse after acceptance. No remote exit code exists in this protocol contract; EOF is transport completion and remote exit remains unknown.

## 4. Error matrix

Invalid user/command/secondary port/peer -> fixed rsh_invalid_user/command/secondary_port/secondary_peer before IO. Parser -> fixed rsh_rejected/rejection_too_long/unexpected_eof/already_finished/invalid_handshake. None include command/user/address/server bytes. Signal enum excludes host numeric input and unsupported signals.

## 5. Good/base/bad

Good: allocate listener, send decimal port NUL, accept verified server callback, send exact metadata/command, transfer accepted stdout tail once. Base: fragmented status/rejection, data bytes transparent. Bad: initial NUL copied from Rlogin, accepting first arbitrary callback, ordinary OS signal enum cast to wire, command auto-replay, output merged or EOF shown asexit0.

## 6. Required tests

Exact split request bytes, 16-byte user bounds/control and multibyte limits, command full cap/noNUL/no truncation, reserved port boundaries, every nonzero status, rejection fragmentation/cap/sticky errors and all EOF states, accepted binary tail, callback source-IP/port mismatch/IPv6, fixed signal values on all host OSes. Actual loopback TCP fixture must inspect request fields and send ACK+binary stdout and rejection; use existing bounded socket fixtures. Native harness and full app CI required. S0 does not prove realrshd, two reserved sockets, stderr drain or UI.

## 7. Wrong vs correct

Wrong: copy the same ACK state machine into a second protocol. Correct: wrap the existing pure status parser with protocol-specific reason mapping. Wrong: use externalrsh or run the command in a local shell. Correct: transmit exact bounded bytes only to the consented peer through the future owned native transport.
