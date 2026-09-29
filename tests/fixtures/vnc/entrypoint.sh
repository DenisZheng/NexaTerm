#!/bin/sh
# Fixture VNC entrypoint. Password is fixture-only ("testpass"), set at
# container start; nothing secret is baked into the image.
set -eu

mkdir -p "$HOME/.vnc"
printf '%s' "testpass" | vncpasswd -f > "$HOME/.vnc/passwd"
chmod 600 "$HOME/.vnc/passwd"

Xtigervnc :1 \
  -geometry 1280x800 \
  -rfbport 5901 \
  -localhost=0 \
  -SecurityTypes VncAuth \
  -PasswordFile "$HOME/.vnc/passwd" &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Start a minimal X client once the virtual X display is ready. Keeping
# Xtigervnc itself as the supervised process makes container readiness explicit
# instead of relying on tigervncserver wrapper/session behaviour.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [ -S /tmp/.X11-unix/X1 ]; then
    DISPLAY=:1 xterm >/tmp/xterm.log 2>&1 &
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
  fi
  sleep 1
done

wait "$server_pid"
