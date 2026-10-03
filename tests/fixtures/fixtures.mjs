// Fixture orchestrator: `node fixtures.mjs up|smoke|down`
//
// up    - generate a throwaway ed25519 keypair (if missing) and start the
//         compose stack. Nothing secret is committed; keys/ is gitignored.
// smoke - wait for ports, then verify direct/legacy one-jump SSH, the
//         isolated WF-06B two-jump NexaTerm path, and X11 forwarding. RDP/VNC are port-checked only;
//         protocol-level acceptance is manual (see README.md).
// wf03-prepare - seed deterministic SSH/SFTP paths for A05/A06 GUI acceptance.
// wf03-mutate  - change the A06 remote file out-of-band to trigger conflict handling.
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
const WF03_ROOT = "/home/testuser/nexaterm-wf03";
const WF03_PANE_A = `${WF03_ROOT}/pane-a`;
const WF03_PANE_B = `${WF03_ROOT}/pane-b`;
const WF03_CONFLICT_FILE = `${WF03_ROOT}/editor-conflict.txt`;

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

function fixtureHostKey(service) {
  const output = sh(
    "docker",
    ["compose", "-f", composeFile, "exec", "-T", service, "cat", "/etc/ssh/ssh_host_ed25519_key.pub"],
    { quiet: true, stdio: "pipe" },
  ).trim();
  const parts = output.split(/\s+/);
  if (parts.length < 2 || parts[0] !== "ssh-ed25519") {
    throw new Error(`invalid ed25519 host key from ${service}`);
  }
  return parts.slice(0, 2).join(" ");
}

function cmdUp() {
  requireTool("docker", ["compose", "version"]);
  requireTool("ssh-keygen", ["-Q", "key"]);
  if (!existsSync(privateKey)) {
    mkdirSync(keysDir, { recursive: true });
    console.log("generating throwaway fixture keypair in tests/fixtures/keys/");
    sh("ssh-keygen", ["-t", "ed25519", "-f", privateKey, "-N", "", "-C", "nexaterm-fixture"]);
  }
  console.log("building fixture images");
  sh("docker", ["compose", "-f", composeFile, "build"], { timeout: 10 * 60_000 });
  console.log("starting fixture containers");
  sh("docker", ["compose", "-f", composeFile, "up", "-d"], { timeout: 60_000 });
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


function requireFixtureKey() {
  if (!existsSync(privateKey)) {
    console.error("error: fixture key is missing; run 'node tests/fixtures/fixtures.mjs up' first");
    process.exit(2);
  }
}

function runFixtureSsh(command, opts = {}) {
  requireTool("ssh", ["-V"]);
  requireFixtureKey();
  return sh(
    "ssh",
    [
      "-i",
      privateKey,
      ...SSH_OPTS,
      "-p",
      "2222",
      "testuser@127.0.0.1",
      command,
    ],
    { quiet: true, stdio: "pipe", ...opts },
  );
}

function cmdWf03Prepare() {
  const command = [
    "set -eu",
    `root='${WF03_ROOT}'`,
    'rm -rf "$root"',
    'mkdir -p "$root/pane-a/deep" "$root/pane-b/deep"',
    'for i in $(seq -w 1 80); do printf "pane-a file %s\\n" "$i" > "$root/pane-a/A-$i.txt"; done',
    'for i in $(seq -w 1 80); do printf "pane-b file %s\\n" "$i" > "$root/pane-b/B-$i.txt"; done',
    'printf "pane-a deep marker\\n" > "$root/pane-a/deep/A-DEEP.txt"',
    'printf "pane-b deep marker\\n" > "$root/pane-b/deep/B-DEEP.txt"',
    'printf "version=1\\norigin=fixture-prepare\\n" > "$root/editor-conflict.txt"',
    'printf "manual browse target\\n" > "$root/manual-browse.txt"',
    'find "$root" -maxdepth 2 -type f -print | sort | head -n 12',
    'stat -c "conflict size=%s mtime=%Y" "$root/editor-conflict.txt"',
  ].join("; ");

  try {
    const output = runFixtureSsh(command).trim();
    console.log("WF-03 acceptance fixture ready");
    if (output) console.log(output);
    console.log("");
    console.log("NexaTerm SSH profile:");
    console.log("  host: 127.0.0.1");
    console.log("  port: 2222");
    console.log("  user: testuser");
    console.log(`  private key: ${privateKey}`);
    console.log("");
    console.log("A05 paths:");
    console.log(`  pane A: ${WF03_PANE_A}`);
    console.log(`  pane B: ${WF03_PANE_B}`);
    console.log("");
    console.log("A06 file:");
    console.log(`  ${WF03_CONFLICT_FILE}`);
    console.log("");
    console.log("When the A06 editor has unsaved local changes, run:");
    console.log("  node tests/fixtures/fixtures.mjs wf03-mutate");
  } catch (e) {
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    console.error(
      "WF-03 prepare failed. Make sure the fixtures are running with 'node tests/fixtures/fixtures.mjs up'.",
    );
    console.error(stderr || e.message.split("\n")[0]);
    process.exit(1);
  }
}

function cmdWf03Mutate() {
  const command = [
    "set -eu",
    `file='${WF03_CONFLICT_FILE}'`,
    'test -f "$file"',
    'printf "version=2\\norigin=external-mutation\\nchanged_at=%s\\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$file"',
    'stat -c "conflict size=%s mtime=%Y" "$file"',
    'cat "$file"',
  ].join("; ");

  try {
    const output = runFixtureSsh(command).trim();
    console.log("WF-03 A06 remote file mutated out-of-band");
    if (output) console.log(output);
  } catch (e) {
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    console.error(
      "WF-03 mutate failed. Run wf03-prepare first and keep the fixtures running.",
    );
    console.error(stderr || e.message.split("\n")[0]);
    process.exit(1);
  }
}

async function cmdSmoke() {
  requireTool("ssh", ["-V"]);
  const ports = [
    ["ssh-jump (2222)", 2222],
    ["ssh-x11 (2223)", 2223],
    ["ssh-jump-outer / WF-06B (2224)", 2224],
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
      name: "legacy one-jump ssh via ssh-jump to ssh-target",
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

  try {
    requireTool("cargo", ["--version"]);
    requireTool("ssh-keyscan", ["-h"]);
    const display = process.env.DISPLAY || "";
    if (!display) throw new Error("DISPLAY is missing; run smoke under xvfb-run");

    const xauthOutput = sh("xauth", ["list"], { quiet: true, stdio: "pipe" });
    const cookieMatch = xauthOutput.match(/MIT-MAGIC-COOKIE-1\s+([0-9a-f]+)/i);
    if (!cookieMatch) throw new Error("could not read MIT-MAGIC-COOKIE-1 from host XAUTHORITY");

    const keyscan = sh(
      "ssh-keyscan",
      ["-t", "ed25519", "-p", "2223", "127.0.0.1"],
      { quiet: true, stdio: "pipe" },
    );
    const keyLine = keyscan
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && line.includes(" ssh-ed25519 "));
    if (!keyLine) throw new Error("ssh-keyscan did not return the fixture ed25519 host key");
    const keyParts = keyLine.split(/\s+/);
    const hostKey = keyParts.slice(1).join(" ");

    sh(
      "cargo",
      [
        "test",
        "--lib",
        "--locked",
        "x11_fixture_russh_path_reaches_host_xvfb",
        "--",
        "--ignored",
        "--nocapture",
      ],
      {
        cwd: path.join(dir, "..", "..", "src-tauri"),
        timeout: 10 * 60_000,
        env: {
          ...process.env,
          NEXATERM_FIXTURE_X11_KEY: privateKey,
          NEXATERM_FIXTURE_X11_HOST_KEY: hostKey,
          NEXATERM_FIXTURE_X11_DISPLAY: display,
          NEXATERM_FIXTURE_X11_COOKIE: cookieMatch[1],
        },
      },
    );
    results.push(["NexaTerm russh X11 reaches host Xvfb", true]);
  } catch (e) {
    results.push(["NexaTerm russh X11 reaches host Xvfb", false]);
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    console.error(`NexaTerm russh X11 probe failed: ${stderr || e.message.split("\n")[0]}`);
  }


  try {
    requireTool("cargo", ["--version"]);
    const outerHostKey = fixtureHostKey("ssh-jump-outer");
    const innerHostKey = fixtureHostKey("ssh-jump-inner");
    const targetHostKey = fixtureHostKey("ssh-multihop-target");
    sh(
      "cargo",
      [
        "test",
        "--lib",
        "--locked",
        "wf06b_fixture",
        "--",
        "--ignored",
        "--nocapture",
        "--test-threads=1",
      ],
      {
        cwd: path.join(dir, "..", "..", "src-tauri"),
        timeout: 10 * 60_000,
        env: {
          ...process.env,
          NEXATERM_FIXTURE_WF06B_COMPOSE: composeFile,
          NEXATERM_FIXTURE_WF06B_KEY: privateKey,
          NEXATERM_FIXTURE_WF06B_OUTER_HOST_KEY: outerHostKey,
          NEXATERM_FIXTURE_WF06B_INNER_HOST_KEY: innerHostKey,
          NEXATERM_FIXTURE_WF06B_TARGET_HOST_KEY: targetHostKey,
        },
      },
    );
    results.push(["NexaTerm true two-hop Terminal/SFTP/Tunnel + cleanup", true]);
  } catch (e) {
    results.push(["NexaTerm true two-hop Terminal/SFTP/Tunnel + cleanup", false]);
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    console.error(
      `NexaTerm WF-06B two-hop probe failed: ${stderr || e.message.split("\n")[0]}`,
    );
  }

  try {
    requireTool("cargo", ["--version"]);
    requireTool("ssh-keyscan", ["-h"]);

    const keyscan = sh(
      "ssh-keyscan",
      ["-t", "ed25519", "-p", "2222", "127.0.0.1"],
      { quiet: true, stdio: "pipe" },
    );
    const keyLine = keyscan
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && line.includes(" ssh-ed25519 "));
    if (!keyLine) throw new Error("ssh-keyscan did not return the tunnel fixture ed25519 host key");
    const keyParts = keyLine.split(/\s+/);
    const hostKey = keyParts.slice(1).join(" ");

    sh(
      "cargo",
      [
        "test",
        "--lib",
        "--locked",
        "tunnel_fixture_local_dynamic_remote_real_ssh",
        "--",
        "--ignored",
        "--nocapture",
      ],
      {
        cwd: path.join(dir, "..", "..", "src-tauri"),
        timeout: 10 * 60_000,
        env: {
          ...process.env,
          NEXATERM_FIXTURE_TUNNEL_KEY: privateKey,
          NEXATERM_FIXTURE_TUNNEL_HOST_KEY: hostKey,
        },
      },
    );
    results.push(["NexaTerm tunnel runtime local/dynamic/remote over real SSH", true]);
  } catch (e) {
    results.push(["NexaTerm tunnel runtime local/dynamic/remote over real SSH", false]);
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    console.error(
      `NexaTerm tunnel runtime probe failed: ${stderr || e.message.split("\n")[0]}`,
    );
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
else if (cmd === "wf03-prepare") cmdWf03Prepare();
else if (cmd === "wf03-mutate") cmdWf03Mutate();
else {
  console.error("usage: node fixtures.mjs <up|smoke|wf03-prepare|wf03-mutate|down>");
  process.exit(2);
}
