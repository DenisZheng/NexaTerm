#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const engine = process.argv[2];
if (!["ibus", "fcitx5"].includes(engine)) {
  console.error("usage: node scripts/linux-ime-smoke.mjs <ibus|fcitx5>");
  process.exit(2);
}
if (process.platform !== "linux") {
  console.error("Linux IME smoke is Linux-only");
  process.exit(2);
}
if (!process.env.DISPLAY || !process.env.DBUS_SESSION_BUS_ADDRESS) {
  console.error("Run the smoke under xvfb-run + dbus-run-session");
  process.exit(2);
}

const captureOrigins = [
  "http://127.0.0.1:5520",
  "http://[::1]:5520",
  "http://localhost:5520",
];
let activeCaptureUrl = null;
const expected = "你好";
const phrase = "nihao";
const logs = [];
let tauri;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.stdio || "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${(
        result.stderr ||
        result.stdout ||
        ""
      ).trim()}`,
    );
  }
  return (result.stdout || "").trim();
}

async function configureFcitxProfile() {
  const configDir = path.join(os.homedir(), ".config", "fcitx5");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, "profile"),
    `[Groups/0]
Name=Default
Default Layout=us
DefaultIM=pinyin

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=pinyin
Layout=

[GroupOrder]
0=Default
`,
  );
}

async function startInputMethod() {
  if (engine === "ibus") {
    run("ibus-daemon", ["--daemonize", "--replace", "--xim"]);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = spawnSync("ibus", ["list-engine"], {
        encoding: "utf8",
        stdio: "pipe",
      });
      if (result.status === 0 && /\blibpinyin\b/.test(result.stdout || "")) {
        return;
      }
      await sleep(200);
    }
    throw new Error("IBus libpinyin engine did not become available");
  }

  await configureFcitxProfile();
  run("fcitx5", ["-d", "--replace"]);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync("fcitx5-remote", [], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.status === 0) {
      return;
    }
    await sleep(200);
  }
  throw new Error("Fcitx5 daemon did not become available");
}

function imeEnvironment() {
  if (engine === "ibus") {
    return {
      GTK_IM_MODULE: "ibus",
      QT_IM_MODULE: "ibus",
      XMODIFIERS: "@im=ibus",
    };
  }
  return {
    GTK_IM_MODULE: "fcitx",
    QT_IM_MODULE: "fcitx",
    XMODIFIERS: "@im=fcitx",
  };
}

async function fetchCapture(method = "GET") {
  const urls = activeCaptureUrl
    ? [activeCaptureUrl]
    : captureOrigins.map((origin) => `${origin}/__nexaterm_ime_capture`);
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { method });
      if (!response.ok) {
        throw new Error(`${method} ${url} failed: ${response.status}`);
      }
      activeCaptureUrl = url;
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`capture ${method} failed`);
}

async function getEvents() {
  const response = await fetchCapture();
  return response.json();
}

async function clearEvents() {
  await fetchCapture("DELETE");
}

async function waitFor(predicate, description, timeoutMs = 180_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`,
  );
}

function startTauri() {
  const env = {
    ...process.env,
    ...imeEnvironment(),
    VITE_NEXATERM_IME_SMOKE: "1",
    WEBKIT_DISABLE_COMPOSITING_MODE: "1",
    GDK_BACKEND: "x11",
    CI: "1",
  };
  const child = spawn("pnpm", ["tauri", "dev", "--no-watch"], {
    cwd: process.cwd(),
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const record = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join("").length > 100_000) logs.shift();
    process.stdout.write(text);
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      logs.push(`tauri dev exited with code ${code} signal ${signal}\n`);
    }
  });
  return child;
}

async function waitForWindow() {
  return waitFor(() => {
    const result = spawnSync(
      "xdotool",
      ["search", "--onlyvisible", "--name", "NexaTerm"],
      { encoding: "utf8", stdio: "pipe" },
    );
    if (result.status !== 0) return null;
    return (result.stdout || "").trim().split(/\s+/).filter(Boolean)[0] || null;
  }, "visible NexaTerm window", 180_000);
}

function focusTerminal(windowId) {
  run("xdotool", ["windowfocus", "--sync", windowId]);
  const geometry = run("xdotool", ["getwindowgeometry", "--shell", windowId]);
  const values = Object.fromEntries(
    geometry
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const [key, value] = line.split("=", 2);
        return [key, Number.parseInt(value, 10)];
      }),
  );
  const x = Number.isFinite(values.X) ? values.X + Math.min(180, Math.floor(values.WIDTH / 3)) : 160;
  const y = Number.isFinite(values.Y) ? values.Y + Math.min(180, Math.floor(values.HEIGHT / 3)) : 160;
  run("xdotool", ["mousemove", "--sync", String(x), String(y), "click", "1"]);
}

function activateChineseEngine() {
  if (engine === "ibus") {
    run("ibus", ["engine", "libpinyin"]);
    return;
  }
  run("fcitx5-remote", ["-s", "pinyin"]);
  run("fcitx5-remote", ["-o"]);
}

function typePhrase() {
  run("xdotool", ["type", "--delay", "90", phrase]);
  run("xdotool", ["key", "space"]);
}

async function verifyCapture() {
  return waitFor(async () => {
    const events = await getEvents();
    const kinds = events.map((event) => event.kind);
    const data = events
      .filter((event) => event.kind === "data")
      .map((event) => event.data || "")
      .join("");
    const ended = events.find(
      (event) => event.kind === "compositionend" && (event.data || "").includes(expected),
    );
    if (
      kinds.includes("compositionstart") &&
      kinds.includes("compositionupdate") &&
      ended &&
      data.includes(expected)
    ) {
      return { events, data };
    }
    return null;
  }, `${engine} composition commit ${expected}`, 20_000);
}

function cleanup() {
  try {
    if (engine === "ibus") {
      spawnSync("ibus", ["exit"], { stdio: "ignore" });
    } else {
      spawnSync("fcitx5-remote", ["-e"], { stdio: "ignore" });
    }
  } catch {}
  if (tauri?.pid) {
    try {
      process.kill(-tauri.pid, "SIGTERM");
    } catch {}
  }
}

try {
  await startInputMethod();
  tauri = startTauri();

  await waitFor(async () => {
    const events = await getEvents();
    return events.some((event) => event.kind === "ready") ? events : null;
  }, "IME smoke page ready", 180_000);

  const windowId = await waitForWindow();
  focusTerminal(windowId);
  activateChineseEngine();
  await sleep(500);
  await clearEvents();
  focusTerminal(windowId);
  typePhrase();

  const result = await verifyCapture();
  console.log(
    `Linux IME smoke passed: engine=${engine}, data=${JSON.stringify(result.data)}`,
  );
} catch (error) {
  console.error(`Linux IME smoke failed for ${engine}: ${error.message}`);
  const recent = logs.join("").slice(-20_000);
  if (recent) console.error("\n--- recent tauri dev output ---\n" + recent);
  process.exitCode = 1;
} finally {
  cleanup();
}
