// Fixture orchestrator: `node fixtures.mjs up|smoke|down`
//
// up    - generate a throwaway ed25519 keypair (if missing) and start the
//         compose stack. Nothing secret is committed; keys/ is gitignored.
// smoke - wait for ports, then verify: direct SSH, double-hop SSH via the
//         jump host, and X11 forwarding. RDP/VNC are port-checked only;
//         protocol-level acceptance is manual (see README.md).
// down  - stop the stack and remove volumes.
//
// Requires: docker (compose v2) and an OpenSSH client. CI runs this on
// ubuntu-22.04; on Windows use WSL2 or Git Bash with Docker Desktop.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const composeFile = path.join(dir, "docker-compose.yml");
const keysDir = path.join(dir, "keys");
const privateKey = path.join(keysDir, "test_key");

const SSH_OPTS = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=no",
  "-o",
  "UserKnownHostsFile=/dev/null",
  "-o",
  "ConnectTimeout=15",
];

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    timeout: 60_000,
    stdio: opts.quiet ? "pipe" : "inherit",
    ...opts,
  });
}

function requireTool(name, probeArgs) {
  const r = spawnSync(name, probeArgs, { stdio: "ignore" });
  if (r.error) {
    console.error(`error: required tool '${name}' could not be executed: ${r.error.message}`);
    process.exit(2);
  }
}

function cmdUp() {
  requireTool("docker", ["compose", "version"]);
  requireTool("ssh-keygen", ["-Q", "key"]);
  if (!existsSync(privateKey)) {
    mkdirSync(keysDir, { recursive: true });
    console.log("generating throwaway fixture keypair in tests/fixtures/keys/");
    sh("ssh-keygen", ["-t", "ed25519", "-f", privateKey, "-N", "", "-C", "nexaterm-fixture"]);
  }
  sh("docker", ["compose", "-f", composeFile, "up", "-d", "--build"]);
  console.log("fixtures up");
}

function cmdDown() {
  requireTool("docker", ["compose", "version"]);
  sh("docker", ["compose", "-f", composeFile, "down", "-v"]);
  console.log("fixtures down");
}

function waitPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.connect(port, host);
      sock.on("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(tryOnce, 1000);
      });
    };
    tryOnce();
  });
}

async function cmdSmoke() {
  requireTool("ssh", ["-V"]);
  const ports = [
    ["ssh-jump (2222)", 2222],
    ["ssh-x11 (2223)", 2223],
    ["xrdp (3389)", 3389],
    ["vnc (5901)", 5901],
  ];
  const results = [];
  for (const [name, port] of ports) {
    const ok = await waitPort("127.0.0.1", port, 90_000);
    results.push([`port ${name} open`, ok]);
  }

  const sshBase = ["-i", privateKey, ...SSH_OPTS];
  const checks = [
    {
      name: "direct ssh to jump host",
      args: [...sshBase, "-p", "2222", "testuser@127.0.0.1", "echo ssh-jump-ok"],
      expect: "ssh-jump-ok",
    },
    {
      name: "double-hop ssh via jump to ssh-target",
      args: [
        ...sshBase,
        "-o",
        `ProxyCommand=ssh -i ${privateKey} -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -p 2222 -W %h:%p testuser@127.0.0.1`,
        "testuser@ssh-target",
        "echo ssh-target-ok",
      ],
      expect: "ssh-target-ok",
    },
    {
      name: "x11 forwarding (xauth list non-empty)",
      args: [...sshBase, "-X", "-p", "2223", "testuser@127.0.0.1", "xauth list"],
      expectNonEmpty: true,
    },
  ];
  for (const c of checks) {
    try {
      const out = sh("ssh", c.args, { quiet: true, stdio: "pipe" }).trim();
      const ok = c.expect ? out.includes(c.expect) : out.length > 0;
      results.push([c.name, ok]);
      if (!ok) console.error(`unexpected output for '${c.name}': ${JSON.stringify(out)}`);
    } catch (e) {
      results.push([c.name, false]);
      const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
      console.error(
        `check '${c.name}' failed: ${stderr || e.message.split("\n")[0]}`,
      );
    }
  }

  let failed = 0;
  for (const [name, ok] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`${failed} fixture check(s) failed`);
    process.exit(1);
  }
  console.log("all fixture checks passed");
}

const cmd = process.argv[2];
if (cmd === "up") cmdUp();
else if (cmd === "down") cmdDown();
else if (cmd === "smoke") await cmdSmoke();
else {
  console.error("usage: node fixtures.mjs <up|smoke|down>");
  process.exit(2);
}
