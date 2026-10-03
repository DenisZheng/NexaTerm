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
