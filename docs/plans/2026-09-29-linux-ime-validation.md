# Linux IME validation

Date: 2026-09-29

## Scope

P2-3 validates the terminal input path with native Linux WebKitGTK using both
IBus libpinyin and Fcitx5 pinyin. NexaTerm does not implement its own IME state
machine; xterm owns the hidden textarea/composition lifecycle and NexaTerm
forwards only xterm's committed `onData` output to the PTY.

## Application guard

NexaTerm's custom Ctrl+C/Ctrl+V keyboard interception now returns immediately
for active composition and legacy process-key 229 events. This prevents
application shortcuts from stealing IME keystrokes before xterm sees them.

## CI smoke

The `Linux IME ibus` and `Linux IME fcitx5` jobs run on Ubuntu 22.04 under:

- Xvfb (real X11 display);
- D-Bus session;
- the actual Tauri dev application / WebKitGTK;
- the installed IBus or Fcitx5 GTK input module;
- xterm 6.x with Unicode 11 width rules.

The smoke harness is enabled only by `VITE_NEXATERM_IME_SMOKE=1`. It records
native `compositionstart`, `compositionupdate`, `compositionend` and xterm
`onData` events through a test-only Vite endpoint.

The runner selects the pinyin engine, focuses the real Tauri window, sends
`nihao + Space` through XTest/xdotool and passes only when:

1. composition start/update/end events occur;
2. the committed composition contains `你好`;
3. xterm `onData` contains `你好`.

Normal production startup never imports the smoke harness.

## Platform boundary

CI proves the GTK/X11 path used by Ubuntu runners. Wayland compositor-specific
text-input behavior is not emulated by Xvfb; release smoke on a real Wayland
desktop remains useful, especially for distro/WebKitGTK upgrades. The same
application rule applies there: NexaTerm must not intercept composition events.

## Current decision

If both Linux IME matrix jobs pass, P2-3's automated Linux IME evidence is
considered closed for IBus and Fcitx5 on the supported Ubuntu/WebKitGTK CI
baseline. New xterm/WebKitGTK versions must continue to pass these jobs.
