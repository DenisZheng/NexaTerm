import net from "node:net";

const host = process.env.NEXATERM_TELNET_FIXTURE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.NEXATERM_TELNET_FIXTURE_PORT || "2323", 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("NEXATERM_TELNET_FIXTURE_PORT must be a valid TCP port.");
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  socket.write("NexaTerm Telnet fixture ready\r\n");
  socket.on("data", (data) => {
    socket.write(data);
  });
});

server.listen(port, host, () => {
  process.stdout.write(`NexaTerm Telnet fixture listening on ${host}:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
