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
