#!/bin/sh
# Fixture xrdp entrypoint. Credentials are fixture-only (testuser/testpass),
# never used outside this throwaway container.
set -e

# Ensure the RSA keypair xrdp needs exists (package postinst normally does this
# at build time; regenerate defensively in case the layer was flattened).
if [ ! -f /etc/xrdp/rsakeys.ini ]; then
  xrdp-keygen xrdp auto
fi

/usr/sbin/xrdp-sesman &
exec /usr/sbin/xrdp --nodaemon
