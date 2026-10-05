import net from "node:net";

const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function probeBanner(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("banner timeout"));
    }, 5000);
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\n")) {
        clearTimeout(timer);
        socket.destroy();
        resolve(data.split(/\r?\n/, 1)[0]);
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function probeSocks(port, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SOCKS probe timeout"));
    }, 7000);
    let stage = "method";
    let buffer = Buffer.alloc(0);

    const finish = (error, value) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.on("connect", () => socket.write(Buffer.from([0x05, 0x01, 0x00])));
    socket.on("error", (error) => finish(error));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === "method" && buffer.length >= 2) {
        const reply = buffer.subarray(0, 2);
        buffer = buffer.subarray(2);
        if (reply[0] !== 0x05 || reply[1] !== 0x00) {
          finish(new Error(`SOCKS method rejected: ${reply.toString("hex")}`));
          return;
        }
        const host = Buffer.from(targetHost, "utf8");
        const request = Buffer.alloc(7 + host.length);
        request[0] = 0x05;
        request[1] = 0x01;
        request[2] = 0x00;
        request[3] = 0x03;
        request[4] = host.length;
        host.copy(request, 5);
        request.writeUInt16BE(targetPort, 5 + host.length);
        socket.write(request);
        stage = "connect";
      }
      if (stage === "connect" && buffer.length >= 10) {
        const reply = buffer.subarray(0, 10);
        buffer = buffer.subarray(10);
        if (reply[0] !== 0x05 || reply[1] !== 0x00) {
          finish(new Error(`SOCKS CONNECT rejected: ${reply.toString("hex")}`));
          return;
        }
        stage = "banner";
      }
      if (stage === "banner") {
        const newline = buffer.indexOf(0x0a);
        if (newline >= 0) {
          finish(null, buffer.subarray(0, newline + 1).toString("utf8").trim());
        }
      }
    });
  });
}

function runEcho(port) {
  const server = net.createServer((socket) => {
    socket.on("data", (data) => socket.write(data));
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`WF-06 tunnel echo listening on 127.0.0.1:${port}`);
  });
  const close = () => server.close(() => process.exit(0));
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

if (mode === "local") {
  const port = Number.parseInt(process.argv[3] || "15422", 10);
  try {
    const banner = await probeBanner(port);
    if (!banner.startsWith("SSH-2.0-")) fail(`unexpected banner: ${banner}`);
    console.log(`PASS local tunnel -> ${banner}`);
  } catch (error) {
    fail(`local tunnel probe failed: ${error.message}`);
  }
} else if (mode === "socks") {
  const port = Number.parseInt(process.argv[3] || "11080", 10);
  const host = process.argv[4] || "ssh-target";
  const targetPort = Number.parseInt(process.argv[5] || "22", 10);
  try {
    const banner = await probeSocks(port, host, targetPort);
    if (!banner.startsWith("SSH-2.0-")) fail(`unexpected banner: ${banner}`);
    console.log(`PASS SOCKS tunnel -> ${host}:${targetPort} -> ${banner}`);
  } catch (error) {
    fail(`SOCKS tunnel probe failed: ${error.message}`);
  }
} else if (mode === "echo") {
  const port = Number.parseInt(process.argv[3] || "18081", 10);
  runEcho(port);
} else {
  fail("usage: node tunnel-probe.mjs <local [port] | socks [port host targetPort] | echo [port]>");
}
