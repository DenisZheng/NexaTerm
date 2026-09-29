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
