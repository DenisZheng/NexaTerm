#!/bin/sh
# Fixture VNC entrypoint. Password is fixture-only ("testpass"), set at
# container start; nothing secret is baked into the image.
set -e

mkdir -p "$HOME/.vnc"
printf '%s' "testpass" | vncpasswd -f > "$HOME/.vnc/passwd"
chmod 600 "$HOME/.vnc/passwd"

exec vncserver :1 -geometry 1280x800 -localhost no -fg
