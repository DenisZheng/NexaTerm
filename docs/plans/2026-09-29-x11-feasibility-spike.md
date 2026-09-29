# P0-2 X11 Forwarding Feasibility Spike

Date: 2026-09-29

## Question

Can NexaTerm add SSH X11 forwarding on the current Rust SSH stack without replacing `russh`, and can it do so without leaking the local X server authentication cookie to the remote host?

This spike is deliberately not a product-complete X11 implementation. It must answer the go/no-go questions before UI and distribution work are scheduled.

## Current baseline

- NexaTerm uses `russh 0.61.1`.
- The production SSH handler currently covers host-key verification and forwarded TCP/IP channels, but has no X11 request/channel implementation.
- The Docker fixture already proves that the test OpenSSH server accepts X11 forwarding when driven by the system OpenSSH client (`ssh -X` + non-empty `xauth list`). That proves the fixture/server side, not the NexaTerm/russh client path.
- X11 remains Experimental and is not a v1 release blocker.

## Library feasibility: GO

The current russh API family exposes the primitives required by RFC 4254 X11 forwarding:

- session channel `request_x11(...)`;
- incoming server-opened X11 channel callback in the client handler;
- channel stream conversion suitable for bidirectional forwarding.

Reference:
- https://docs.rs/russh/latest/russh/struct.Channel.html
- https://docs.rs/russh/latest/russh/client/trait.Handler.html

Therefore the SSH library itself is not a blocker. The remaining risk is integration and platform distribution.

## Security model

NexaTerm must not send the real local X server cookie to the SSH server.

The forwarding design follows the usual fake-cookie pattern:

1. read the local display target and real MIT-MAGIC-COOKIE-1 value;
2. generate a random fake cookie of the same length;
3. request X11 forwarding from the SSH server using the fake cookie;
4. when the server opens an X11 channel, read the first X11 connection setup packet;
5. verify that the setup packet contains the expected auth protocol and fake cookie;
6. replace only that cookie with the local real cookie;
7. forward the rewritten setup and subsequent bytes to the local X server.

The spike module implements steps 1 (DISPLAY target parsing) and 5–6 (strict first-packet cookie replacement). It rejects malformed setup packets, unsupported auth protocol, wrong fake cookie, and length mismatch.

## Local DISPLAY targets

The first slice recognizes:

- Unix/Xorg display, e.g. `:0` -> `/tmp/.X11-unix/X0` on Unix;
- TCP display, e.g. `localhost:10.0` -> port 6010;
- XQuartz launchd display, e.g. `/private/tmp/com.apple.launchd.../org.xquartz:0` -> launchd Unix socket path.

XQuartz documents the launchd DISPLAY form and normal SSH-X11 flow:
https://github.com/XQuartz/xquartz.github.io/blob/master/FAQs.md

Windows will require a locally running X server and generally uses TCP display endpoints. Bundling an X server is a separate licensing/distribution decision and is not implied by this spike.

## Go / No-Go gates

### Gate A — compile/API

GO when all three platform CI jobs compile the spike module with the locked russh version.

### Gate B — protocol path

GO when the NexaTerm russh path can:

- request X11 on an authenticated SSH session;
- receive a server-opened X11 channel;
- reject a channel if no X11 forwarding state is registered;
- connect that channel to a configured local X display target;
- rewrite the fake cookie exactly once before local delivery;
- close both sides on cancellation/disconnect.

### Gate C — real environment

GO when the Linux fixture demonstrates, through NexaTerm/russh rather than the system `ssh` command:

- remote `DISPLAY` is populated;
- remote `xauth list` is non-empty;
- one simple X client connects to the CI Xvfb server;
- wrong cookie and missing local X server fail closed;
- Host Key verification remains on the existing production path.

### Gate D — platform product decision

After Gate C:

- Linux: determine Xorg/XWayland assumptions and IME/window behavior.
- macOS: verify XQuartz presence, launchd socket handling, and current supported macOS versions.
- Windows: choose external-X-server requirement versus bundled dependency; record license, installer size, update and support cost.

Formal cross-platform X11 support remains No-Go until these platform dependencies have an explicit distribution/support policy.

## First-slice code

`src-tauri/src/x11_forward.rs` currently provides:

- DISPLAY parsing to a local Unix/TCP target;
- XQuartz launchd DISPLAY parsing;
- little- and big-endian X11 setup parsing;
- strict MIT-MAGIC-COOKIE-1 matching;
- fake-to-real cookie replacement;
- malformed/truncated/wrong-cookie rejection tests.

It is intentionally not yet wired into `TerminalSession`.

## Next implementation slice

1. add an `X11ForwardState` beside the existing `RemoteForwardState`;
2. implement `KnownHostClient::server_channel_open_x11` and fail closed when state is absent;
3. add a local target connector (UnixStream on Unix, TcpStream where applicable);
4. request X11 on the terminal channel before shell startup;
5. add a Linux fixture executable/path that exercises the NexaTerm/russh implementation against `ssh-x11` under Xvfb;
6. only after the real smoke passes, expose an Experimental connection setting.

## Current conclusion

**GO for continued spike work.**

Reason: the locked SSH library exposes the necessary protocol primitives and the cookie-isolation logic is implementable without exposing the local cookie to the remote server. This is not yet a GO for shipping X11: real russh fixture forwarding and platform dependency/distribution validation are still required.
