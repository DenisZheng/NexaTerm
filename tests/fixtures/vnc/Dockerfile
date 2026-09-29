FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends tigervnc-standalone-server tigervnc-tools xterm \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -s /bin/bash testuser \
  && mkdir -p /home/testuser/.vnc \
  && chown -R testuser:testuser /home/testuser/.vnc

COPY xstartup /home/testuser/.vnc/xstartup
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /home/testuser/.vnc/xstartup /usr/local/bin/entrypoint.sh \
  && chown testuser:testuser /home/testuser/.vnc/xstartup

EXPOSE 5901
USER testuser
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
