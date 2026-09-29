#!/bin/sh
# Fixture sshd entrypoint: key-only auth for `testuser`, host keys generated
# at first boot. The client's public key is mounted at /keys/test_key.pub by
# fixtures.mjs; nothing secret is baked into the image.
set -e

ssh-keygen -A

mkdir -p /home/testuser/.ssh
if [ -f /keys/test_key.pub ]; then
  cp /keys/test_key.pub /home/testuser/.ssh/authorized_keys
  chmod 600 /home/testuser/.ssh/authorized_keys
fi
chmod 700 /home/testuser/.ssh
chown -R testuser:testuser /home/testuser/.ssh

# Harden to key-only auth.
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

if [ "${ENABLE_X11}" = "yes" ]; then
  sed -i 's/^#*X11Forwarding.*/X11Forwarding yes/' /etc/ssh/sshd_config
  # In containers the X proxy must bind beyond loopback for `ssh -X` to work.
  printf '%s\n' "X11UseLocalhost no" >> /etc/ssh/sshd_config
fi

exec /usr/sbin/sshd -D -e
