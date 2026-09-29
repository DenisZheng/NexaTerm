FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

# xorgxrdp provides the Xorg backend xrdp's default session expects;
# xfce4 is a light desktop for the RDP session.
RUN apt-get update \
  && apt-get install -y --no-install-recommends xrdp xorgxrdp xfce4 xfce4-terminal dbus-x11 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -s /bin/bash testuser \
  && printf '%s\n' "testuser:testpass" | chpasswd \
  && adduser xrdp ssl-cert \
  && printf '%s\n' "xfce4-session" > /home/testuser/.xsession \
  && chown testuser:testuser /home/testuser/.xsession

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3389
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
