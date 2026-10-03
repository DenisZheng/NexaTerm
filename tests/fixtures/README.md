# Test fixtures (docker-compose)

Real servers for acceptance items **A12** (jump-host SSH + Files + the three
tunnel types) and **A13** (SSH X11 launching a remote GUI program), plus RDP
and VNC targets for the WF-06 remote-desktop work.

## Services

| Service      | Host port | Purpose                                              |
| ------------ | --------- | ---------------------------------------------------- |
| `ssh-jump`   | 2222      | Jump host. SSH in here first.                        |
| `ssh-target` | —         | **No published ports** — reachable only via `ssh-jump`, so it is a genuine double-hop chain. |
| `ssh-x11`    | 2223      | sshd with `X11Forwarding yes` for A13.               |
| `xrdp`       | 3389      | RDP server (xrdp + Xorg + xfce4).                    |
| `vnc`        | 5901      | TigerVNC server (`:1`, minimal xterm session).       |

All images build from `ubuntu:24.04` with local Dockerfiles — no external
image trust beyond the base OS.

## Quickstart

```sh
node tests/fixtures/fixtures.mjs up     # generate keypair + build + start
node tests/fixtures/fixtures.mjs smoke  # port + SSH + double-hop + X11 checks
node tests/fixtures/fixtures.mjs down   # stop and remove volumes
```

Requires `docker` (compose v2) and an OpenSSH client. CI runs `up`/`smoke`/
`down` on ubuntu-22.04 (see `.github/workflows/ci.yml`, job `fixtures`).

## Credentials (fixture-only, throwaway)

- SSH: user `testuser`, key at `tests/fixtures/keys/test_key` — generated on
  first `up`, gitignored, never committed. Key-only auth; passwords disabled.
- xrdp: `testuser` / `testpass`
- VNC: password `testpass`


## WF-03 A05 / A06 GUI acceptance

Use the direct SSH fixture on `127.0.0.1:2222` so terminal and Files/SFTP share one real test host.

Prepare deterministic directories and the conflict test file:

```sh
node tests/fixtures/fixtures.mjs up
node tests/fixtures/fixtures.mjs wf03-prepare
```

The prepare command prints the generated private-key path and these fixed remote paths:

- A05 pane A: `/home/testuser/nexaterm-wf03/pane-a`
- A05 pane B: `/home/testuser/nexaterm-wf03/pane-b`
- A06 conflict file: `/home/testuser/nexaterm-wf03/editor-conflict.txt`

Create or use a NexaTerm SSH profile with host `127.0.0.1`, port `2222`, user
`testuser`, and the generated `tests/fixtures/keys/test_key` private key.

### A05

Open two SSH instances from that same saved profile and place them in two panes.
Enable **follow terminal directory** independently in each Files view. In pane A run
`cd /home/testuser/nexaterm-wf03/pane-a`; in pane B run
`cd /home/testuser/nexaterm-wf03/pane-b`. Switch focus rapidly between panes.

Pass conditions:

- Files for pane A shows `A-*.txt` and pane B shows `B-*.txt`.
- Each pane restores its own directory after repeated focus switches.
- A stale/late directory response never replaces the currently focused pane's Files view.
- Disconnecting one pane does not borrow the sibling pane's Files context; reconnect keeps the same logical pane owner.

The deterministic delayed-response race is also covered by WF-03B automated tests; the GUI check verifies the real Tauri pane/Files binding.

### A06

Open `/home/testuser/nexaterm-wf03/editor-conflict.txt` from Files and make an
unsaved local edit. While that editor remains open, mutate the remote file outside
NexaTerm:

```sh
node tests/fixtures/fixtures.mjs wf03-mutate
```

Then save in NexaTerm.

Pass conditions:

- Saving detects the mtime/size mismatch and shows the remote-change conflict dialog.
- The dialog offers reload, overwrite save, and cancel; no silent overwrite occurs.
- After resolving the conflict, make another unsaved edit and close the editor/tab.
  NexaTerm must explicitly confirm discarding the unsaved change; canceling the close
  keeps the editor and its content.

When finished:

```sh
node tests/fixtures/fixtures.mjs down
```

## Manual acceptance examples

Double-hop SSH (A12):

```sh
ssh -i tests/fixtures/keys/test_key -p 2222 testuser@127.0.0.1
# from inside the jump host:
ssh testuser@ssh-target
# or in one hop from your machine:
ssh -i tests/fixtures/keys/test_key -J testuser@127.0.0.1:2222 testuser@ssh-target
```

X11 forwarding (A13):

```sh
ssh -X -i tests/fixtures/keys/test_key -p 2223 testuser@127.0.0.1 xterm
```

RDP: connect an RDP client to `127.0.0.1:3389`, log in as `testuser`/`testpass`.
VNC: connect a VNC viewer to `127.0.0.1:5901`, password `testpass`.


## WF-04B A08 / Split GUI acceptance

Use the direct SSH fixture on `127.0.0.1:2222`. Start it first:

```sh
node tests/fixtures/fixtures.mjs up
```

The generated private key is `tests/fixtures/keys/test_key`. In NexaTerm create a parent group such as `A08 Batch` and these saved SSH profiles inside it:

| Profile | Host / port | User | Authentication | Purpose |
| --- | --- | --- | --- | --- |
| `A08-existing` | `127.0.0.1:2222` | `testuser` | generated private key | open this before the batch; it must survive cancel/failure |
| `A08-success` | `127.0.0.1:2222` | `testuser` | generated private key | deterministic success |
| `A08-fail` | `127.0.0.1:2222` | `wronguser` | generated private key | deterministic SSH authentication failure |
| `A08-wait` | `127.0.0.1:2222` | `testuser` | ask/prompt at connection time | keeps one batch item in waiting-user until handled or cancelled |

If the local UI names the prompt credential mode differently, select the mode that intentionally asks for credentials during connection rather than storing them in the profile.

### A08 batch flow

1. Open `A08-existing` normally and leave that terminal running.
2. Right-click the `A08 Batch` group and choose **Connect all… / 连接全部…**.
3. Confirm the preview includes all four profiles, marks `A08-existing` as already open, and leaves it unchecked by default.
4. Keep `A08-success`, `A08-fail`, and `A08-wait` selected and start the batch.
5. Confirm per-item states are visible. `A08-success` should succeed, `A08-fail` should fail, and `A08-wait` should reach waiting-user.
6. While `A08-wait` is still waiting, choose **Cancel remaining**.
7. Verify the pre-existing `A08-existing` terminal is still alive and usable, and the successful batch terminal is not rolled back.
8. After the batch settles, choose **Retry failed**. Only `A08-fail` should start again; successful/cancelled items must not be replayed automatically.

A08 passes when every item has an explicit final state, cancel/failure does not close `A08-existing`, successful items remain open, and retry touches failed items only.

### Split 2 / 4 pane smoke

With at least two terminal instances open:

1. Start a 2-pane split from a specific terminal instance. The split group title/anchor must follow that exact instance, not another instance from the same saved profile.
2. In the pane picker, verify existing terminal instances are selectable by instance.
3. Verify an SSH profile that already has an open terminal still appears under **New SSH instance / 新建 SSH 实例** and creates a new instance when selected.
4. If Telnet/Serial profiles exist, verify the picker offers **New Telnet / Serial instance / 新建 Telnet / 串口实例**.
5. Create a 4-pane layout and confirm pane focus is unique, ratios remain draggable, and batch completion did not automatically modify Split.
6. Close the original split host while at least two panes remain. The split group must remain usable and re-anchor to a surviving pane instance rather than a same-profile sibling outside the split.

When finished:

```sh
node tests/fixtures/fixtures.mjs down
```


## WF-04C A09 / A10 GUI acceptance

Use the direct SSH fixture on `127.0.0.1:2222`. Start it first:

```sh
node tests/fixtures/fixtures.mjs up
```

Create or reuse one saved SSH profile with host `127.0.0.1`, port `2222`, user
`testuser`, and the generated `tests/fixtures/keys/test_key` private key. Open four
terminal instances from that profile (or use three SSH instances plus one Local terminal)
and place them into a 4-pane Split. Name them by visible instance order as A, B, C, D for
the acceptance run.

### A09 fixed targets + live/send

1. Open MultiExec and explicitly select only A and B. Leave C and D unselected.
2. Enable live input with focus on A. Type a unique command such as
   `echo A09-LIVE-A` and press Enter.
3. Confirm A receives the normal focused input once, B receives the fan-out once, and
   C/D do not receive that command.
4. Change focus to B without touching target checkboxes. Confirm A/B remain the selected
   target set. Type `echo A09-LIVE-B`; B receives normal input once, A receives fan-out
   once, C/D remain untouched.
5. Switch to Command Sender / send mode without changing targets. Send
   `echo A09-SEND` with Enter.
6. Confirm A and B each receive the command once and C/D receive nothing. Switching pane
   focus before another send must not replace either selected target.

A09 passes only if target identity is by terminal instance, each selected target receives
at most one delivery per action, unselected panes are not fan-out destinations, and focus
changes do not silently mutate the selected set.

### A10 disconnect + reconnect

1. Keep A and B explicitly selected. Send `echo A10-BEFORE` once and confirm both receive it.
2. Close/disconnect B while MultiExec remains available. Confirm the UI updates B as
   unavailable/removed rather than silently substituting another instance.
3. Reopen the same saved SSH profile, producing a new terminal instance B2. Focus B2.
4. Confirm B2 is not automatically selected. A remains selected if it stayed connected.
5. Send `echo A10-AFTER`. Confirm only the still-selected target(s) receive it; B2 must
   not receive the command until explicitly selected.
6. Confirm no earlier command is automatically replayed into B2 after reconnect. If a
   send attempt reports a disconnected/failed target, leave it as an explicit result;
   there must be no automatic retry.

A10 passes only if disconnect state is visible, reconnect creates a new instance identity,
the replacement does not silently rejoin targets, and no uncertain/failed command is
automatically resent.

When finished:

```sh
node tests/fixtures/fixtures.mjs down
```


## WF-05 A11 combined GUI acceptance

A11 is intentionally executed only after WF-05A/05B/05C are all implemented. This
section starts the combined checklist with the Local/WSL phase. **A11 remains PENDING**
until the later Serial/Telnet/RDP/VNC phases are appended and the maintainer runs the
whole matrix.

### Phase 1: Local / WSL

Windows real-Tauri requirements:

1. Open **New session** and confirm native Local shells and **WSL** are separate sections.
2. Confirm each installed WSL distribution appears by its real distribution name. Open one
   distribution twice and verify two independent top-level instances are created.
3. Run `echo $$` in both WSL terminals and keep the two Linux shell PIDs for the close check.
4. Put one WSL instance and one native Local terminal into a 2-pane Split. In the pane picker,
   the WSL instance must be labeled as **WSL**, not merely as Local.
5. Select both instances as MultiExec targets. Run one harmless send command such as
   `echo A11-WF05A`; both explicitly selected terminal instances receive it once.
6. Close only the first WSL instance. The sibling WSL instance and native Local instance stay
   open; the closed instance disappears from Split/MultiExec targets and is not substituted by
   its same-distribution sibling.
7. From the surviving WSL instance, run `ps -p <closed-shell-pid>`. The closed shell PID must
   no longer exist. Do not require the whole WSL VM/distribution to stop because other WSL
   processes may legitimately keep it running.
8. Close the remaining WSL and Local tabs normally. No stale terminal pane or MultiExec target
   may remain.

Capability-negative checks on Windows:

- On a machine without `wsl.exe`, the WSL section states that WSL is unavailable.
- With WSL installed but no distribution, the UI states that no distribution is available.
- Probe timeout/failure is shown as such and must not hide otherwise usable PowerShell/cmd/Git
  Bash profiles.

macOS/Linux Local smoke for the combined matrix:

1. Open an available detected Local shell from New session.
2. Put it into Split with another terminal instance and verify instance identity remains stable.
3. Close it and confirm the pane/target is removed and the sibling survives.

Automated evidence already covers provider status classification, stable distro profile identity,
shared PTY close/master release, Local/WSL Split binding, MultiExec instance targeting, and
target shrink on close. These checks do not replace the real Windows WSL run above.

Later WF-05B/05C work must append the Serial/Telnet/RDP/VNC phases here before A11 can be
recorded PASS.


### Phase 2: Serial / Telnet

This phase is appended by WF-05B. **A11 remains PENDING** until WF-05C adds and passes
the RDP/VNC phase.

#### Telnet

Start the deterministic local TCP echo fixture in a separate terminal:

```sh
node tests/fixtures/telnet-loopback.mjs
```

The default endpoint is `127.0.0.1:2323`. You may override it with
`NEXATERM_TELNET_FIXTURE_HOST` / `NEXATERM_TELNET_FIXTURE_PORT`.

1. In **New session**, choose **Telnet…** and confirm ConnectionDialog opens already set to Telnet.
2. Create/save a profile for `127.0.0.1:2323`. Keep the configured enter/backspace modes visible
   in the acceptance notes.
3. Open the profile and confirm the terminal receives `NexaTerm Telnet fixture ready`.
4. Type a unique line such as `A11-TELNET-ONE` and confirm the fixture echoes it back.
5. Explicitly open a **new instance** of the same Telnet profile. Confirm a sibling tab with a
   different instance ordinal is created rather than focus jumping to the first tab.
6. Put one Telnet instance and one other terminal instance into Split. The picker must label the
   Character instance as **Telnet**.
7. Select the Telnet instance as a MultiExec target and send a harmless line. It must receive one
   delivery and remain identified by that exact instance.
8. Close only the first Telnet instance. Its pane/target disappears; the same-profile sibling stays
   connected and is not silently substituted into the selected target set.
9. Stop the Node fixture with Ctrl+C after all Telnet tabs are closed.

#### Serial

Real Serial interoperability must use either a physical serial device or an explicitly documented
simulated serial-port pair. Record the platform, port name(s), device/simulator, baud rate, data
bits, parity, stop bits, and flow control used. Do **not** substitute SSH/Telnet or a pure mocked
provider for this acceptance.

1. In **New session**, choose **Serial…** and confirm ConnectionDialog opens already set to Serial.
2. Observe port enumeration:
   - while refreshing: loading state is visible;
   - successful empty enumeration: no-device state is visible;
   - enumeration failure: failure state is distinguishable from no-device;
   - with the acceptance device attached: available state lists the real/simulated port.
3. Configure the documented framing and open the Serial connection. Confirm real bidirectional
   bytes with the device/simulated peer.
4. Explicitly open a second instance of the same Serial profile if the device/simulator supports
   multiple opens; otherwise document the single-open limitation and use a second Serial profile/
   endpoint for the Split check.
5. Put Serial and Telnet (or another terminal instance) into Split. The picker must label the
   Character instance as **串口 / Serial**.
6. Select Serial as a MultiExec target and send only a harmless payload expected by the device.
   Confirm exactly one delivery to the explicitly selected instance.
7. Close the Serial instance. Confirm its pane/target disappears, no stale writable instance remains,
   and the port/handle can be reopened according to the device/simulator's documented behavior.

Automated evidence covers Telnet real loopback lifecycle, Serial availability classification,
Serial reader close signaling, Character Split/MultiExec instance identity, sibling separation,
and target shrink on close. It does not replace real Serial hardware/simulator behavior.


### Phase 3: RDP / VNC

WF-05C adds the final A11 protocol phase. **A11 remains PENDING** until the maintainer
executes Phase 1, Phase 2 and Phase 3 on the documented real platforms/targets.

RDP/VNC are top-level workspace instances. They are **not terminal Split panes or MultiExec
targets**. Do not expect them in the MultiExec target picker.

#### Windows embedded RDP

Use a reachable Windows RDP target for which interactive testing is authorized. Record the target
environment, Windows version, NexaTerm runner capability text, and whether the session actually
uses `mstsc_activex` or falls back to external `mstsc`.

1. In **New session**, inspect the RDP capability text before opening the dialog. On a machine with
   ActiveX support it must say embedded RDP is available and, when detected, that an external
   fallback also exists.
2. Choose **RDP…** and confirm ConnectionDialog opens already set to RDP. Save/connect to the
   authorized test target.
3. For an actual embedded/native session, confirm the NexaTerm RDP host opens and the workspace
   tab represents that exact session instance.
4. Explicitly open a **new instance** of the same RDP profile. Confirm a second top-level RDP
   instance is created instead of merely focusing the first.
5. Close only the first RDP instance. The sibling stays open. The native host must remove only the
   closed session; if it was the last embedded session, the host may close normally.
6. Exercise an external fallback once (for example by selecting/forcing a supported external mode
   in the test profile). Close the NexaTerm RDP tab and verify the directly owned external runner
   process exits and any generated temporary `.rdp` file is removed.
7. Confirm RDP never appears in the terminal MultiExec target list.

#### macOS / Linux external RDP

Use a reachable authorized RDP target and a runner actually detected by NexaTerm:
Windows App/Microsoft Remote Desktop/default `.rdp` handler on macOS, or FreeRDP on Linux.

1. In **New session**, confirm RDP capability reports an **external** runner rather than embedded.
   If no compatible runner exists, confirm the UI says unavailable and still allows configuration;
   record that limitation instead of claiming RDP worked.
2. Open one RDP profile, then explicitly open a second instance of the same profile.
3. Confirm two top-level NexaTerm workspace instances exist independently.
4. Close one NexaTerm instance and confirm the sibling remains.
5. Verify the directly owned runner/helper process and generated temporary file are cleaned up as
   far as the platform permits. On macOS, if the system `open` helper launches a separate GUI app,
   explicitly record whether that GUI app remains; do not count helper termination as proof that the
   GUI client was closed.
6. Confirm RDP is absent from terminal MultiExec targets.

#### VNC / noVNC bridge

Use a reachable VNC test server for which interactive testing is authorized. Record server type,
host, port, authentication mode and platform.

1. In **New session**, inspect VNC capability. The built-in noVNC bridge should be reported when
   available; any RealVNC/TigerVNC/custom viewer is shown only as an external viewer/fallback.
2. Choose **VNC…**, save/connect, and verify real remote pixels/input through the built-in noVNC
   path or the explicitly selected external viewer.
3. Explicitly open a second instance of the same VNC profile and confirm two independent top-level
   workspace instances exist.
4. For noVNC/windowed mode, close only the first instance. Confirm the local WebSocket bridge and
   any runner-host payload for that instance disappear while the sibling remains usable.
5. For an external viewer mode, close the NexaTerm VNC instance and verify the directly owned
   viewer child exits. Close one sibling without closing the other.
6. Confirm VNC never appears in terminal MultiExec targets.

#### Phase 3 result recording

Record separate results for:
- Windows embedded/native RDP;
- Windows external fallback RDP if exercised;
- macOS external RDP;
- Linux external RDP;
- built-in noVNC bridge;
- any external VNC viewer exercised.

A missing Experimental runner is acceptable as a documented capability limitation, but a platform
must not be marked supported without a corresponding real run. Automated tests cover instance
identity and owner cleanup seams; they do not replace this real platform evidence.
