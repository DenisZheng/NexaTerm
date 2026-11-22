#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { activateInputMethod, inputMethodReady } from "./linux-ime-control.mjs";

// A cold Cargo build is not a WebView/page-readiness check.
export const startupTimeouts = Object.freeze({
  engine: 30_000,
  server: 60_000,
  nativeWindow: 15 * 60_000,
  page: 60_000,
  composition: 20_000,
});
export class SmokeFatalError extends Error {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(predicate, description, timeoutMs, {
  checkHealth = () => {}, now = Date.now, pause = sleep, intervalMs = 250,
} = {}) {
  const started = now();
  let lastError;
  while (now() - started < timeoutMs) {
    // Process death is terminal, not a transient polling failure.
    checkHealth();
    try {
      const value = await predicate();
      lastError = undefined;
      checkHealth();
      if (value) return value;
    } catch (error) {
      if (error instanceof SmokeFatalError) throw error;
      lastError = error;
    }
    await pause(intervalMs);
  }
  checkHealth();
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

export function inputMethodCommand(engine) {
  // Keep the daemon in the child we own. Never spawnSync a daemon with pipes:
  // a forked descendant can keep those pipes open after its launcher exits.
  if (engine === "ibus") return ["ibus-daemon", ["--replace", "--xim"]];
  if (engine === "fcitx5") return ["fcitx5", ["-D", "--replace"]];
  throw new Error(`Unsupported input method: ${engine}`);
}

export function startProcess(command, args, logFile, env = process.env) {
  const fd = openSync(logFile, "w");
  let child;
  try {
    child = spawn(command, args, {
      env, detached: process.platform !== "win32", stdio: ["ignore", fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const managed = { child, command, logFile, failure: null };
  child.on("error", (error) => { managed.failure = `${command}: ${error.message}`; });
  child.on("exit", (code, signal) => {
    managed.failure = `${command} exited (code=${code}, signal=${signal})`;
  });
  return managed;
}

export function assertProcessesAlive(children) {
  for (const managed of children) {
    const { child } = managed;
    if (managed.failure || child.exitCode !== null || child.signalCode !== null) {
      throw new SmokeFatalError(managed.failure || `${managed.command} is no longer running`);
    }
  }
}

export async function stopProcesses(children) {
  const signalAll = (signal) => {
    for (const { child } of children) {
      if (!child.pid) continue;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") console.error(`Process cleanup: ${error.message}`);
      }
    }
  };
  signalAll("SIGTERM");
  await sleep(300);
  // Also clean up descendants if the launcher has already exited.
  signalAll("SIGKILL");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8", stdio: "pipe", timeout: 5_000, killSignal: "SIGKILL",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${
      result.error?.message || result.stderr?.trim() || result.stdout?.trim() || result.status
    }`);
  }
  return result.stdout.trim();
}

async function configureFcitxProfile() {
  const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "fcitx5");
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, "profile"), `[Groups/0]
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
`);
}

function focusTerminal(windowId) {
  run("xdotool", ["windowfocus", "--sync", windowId]);
  // Window-relative coordinates avoid assuming a desktop/window-manager layout.
  run("xdotool", ["mousemove", "--sync", "--window", windowId, "160", "160", "click", "1"]);
}

export async function main(engine) {
  if (!["ibus", "fcitx5"].includes(engine)) throw new Error("usage: node scripts/linux-ime-smoke.mjs <ibus|fcitx5>");
  if (process.platform !== "linux") throw new Error("Linux IME smoke is Linux-only");
  if (!process.env.DISPLAY || !process.env.DBUS_SESSION_BUS_ADDRESS) {
    throw new Error("Run the smoke under xvfb-run + dbus-run-session");
  }
  const logDir = path.resolve("logs", "ime", engine);
  await mkdir(logDir, { recursive: true });
  const children = [];
  const stages = [];
  const inputMethodStatus = {};
  let stage = "initializing";
  let lastEvents = [];
  let failure = null;
  let activeCaptureUrl;
  const expected = "\u4f60\u597d";
  const captureOrigins = ["http://127.0.0.1:5520", "http://[::1]:5520", "http://localhost:5520"];
  const checkHealth = () => assertProcessesAlive(children);
  const phase = async (name, action) => {
    stage = name;
    const entry = { stage, started: new Date().toISOString() };
    stages.push(entry);
    console.log(`[${engine}] ${name}: starting`);
    const value = await action();
    entry.completed = new Date().toISOString();
    console.log(`[${engine}] ${name}: passed`);
    return value;
  };
  const poll = (predicate, description, timeout) => waitFor(predicate, description, timeout, { checkHealth });
  async function fetchCapture(method = "GET") {
    const urls = activeCaptureUrl ? [activeCaptureUrl]
      : captureOrigins.map((origin) => `${origin}/__nexaterm_ime_capture`);
    const errors = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, { method, signal: AbortSignal.timeout(2_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const events = method === "GET" ? await response.json() : null;
        if (method === "GET" && !Array.isArray(events)) throw new Error("capture did not return an event array");
        activeCaptureUrl = url;
        if (events) lastEvents = events;
        return events;
      } catch (error) {
        errors.push(`${url}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`);
      }
    }
    throw new Error(errors.join("; "));
  }
  function checkBrowserErrors(events) {
    const error = events.find((event) => ["bootstrap-error", "page-error", "unhandled-rejection", "csp-error"].includes(event.kind));
    if (error) throw new SmokeFatalError(`${error.kind}: ${error.data || "see captured events"}`);
  }
  try {
    await phase("input-method", async () => {
      if (engine === "fcitx5") await configureFcitxProfile();
      const [command, args] = inputMethodCommand(engine);
      children.push(startProcess(command, args, path.join(logDir, "engine.log")));
      inputMethodStatus.ready = await poll(() => inputMethodReady(engine, run),
        `${engine} daemon ready`, startupTimeouts.engine);
      console.log(`[${engine}] daemon ready: ${JSON.stringify(inputMethodStatus.ready)}`);
    });
    const env = {
      ...process.env,
      GTK_IM_MODULE: engine === "ibus" ? "ibus" : "fcitx",
      QT_IM_MODULE: engine === "ibus" ? "ibus" : "fcitx",
      XMODIFIERS: engine === "ibus" ? "@im=ibus" : "@im=fcitx",
      VITE_NEXATERM_IME_SMOKE: "1", WEBKIT_DISABLE_COMPOSITING_MODE: "1",
      GDK_BACKEND: "x11", CI: "1", CARGO_TERM_COLOR: "never",
    };
    children.push(startProcess("pnpm", ["tauri", "dev", "--no-watch"], path.join(logDir, "tauri.log"), env));
    await phase("capture-server", () => poll(async () => {
      await fetchCapture();
      console.log(`[${engine}] capture endpoint: ${activeCaptureUrl}`);
      return true;
    }, "Vite capture endpoint", startupTimeouts.server));
    // This stage owns the cold-build budget. Only after the native window
    // exists do we start the short page-readiness timer.
    const windowId = await phase("native-build-window", () => poll(async () => {
      checkBrowserErrors(await fetchCapture());
      return run("xdotool", ["search", "--onlyvisible", "--name", "NexaTerm"]).split(/\s+/)[0] || null;
    }, "native NexaTerm window (including cold Cargo build)", startupTimeouts.nativeWindow));
    await phase("page-ready", () => poll(async () => {
      const events = await fetchCapture();
      checkBrowserErrors(events);
      return events.some((event) => event.kind === "ready");
    }, "IME smoke page ready", startupTimeouts.page));
    await phase("activate-engine", async () => {
      focusTerminal(windowId);
      // Retry the activation itself if the native input context is not ready
      // yet, rather than polling forever after a no-op activation without focus.
      inputMethodStatus.active = await poll(() => activateInputMethod(engine, run),
        "Chinese engine activation", startupTimeouts.engine);
      console.log(`[${engine}] active engine: ${JSON.stringify(inputMethodStatus.active)}`);
      await sleep(500);
      await fetchCapture("DELETE");
      focusTerminal(windowId);
    });
    const result = await phase("composition-commit", async () => {
      run("xdotool", ["type", "--delay", "90", "nihao"]);
      run("xdotool", ["key", "space"]);
      return poll(async () => {
        const events = await fetchCapture();
        checkBrowserErrors(events);
        const kinds = events.map((event) => event.kind);
        const data = events.filter((event) => event.kind === "data").map((event) => event.data || "").join("");
        const ended = events.find((event) => event.kind === "compositionend" && (event.data || "").includes(expected));
        if (kinds.includes("compositionstart") && kinds.includes("compositionupdate") && ended && data.includes(expected)) {
          return { events, data };
        }
        return null;
      }, `${engine} composition commit ${expected}`, startupTimeouts.composition);
    });
    console.log(`Linux IME smoke passed: engine=${engine}, data=${JSON.stringify(result.data)}`);
  } catch (error) {
    failure = error;
    console.error(`Linux IME smoke failed for ${engine} at ${stage}: ${error.message}`);
    console.error(`Captured events: ${JSON.stringify(lastEvents).slice(-12_000)}`);
  } finally {
    await stopProcesses(children);
    const summary = { engine, stage, success: !failure, error: failure?.message, captureUrl: activeCaptureUrl, inputMethodStatus, stages, events: lastEvents };
    await writeFile(path.join(logDir, "result.json"), JSON.stringify(summary, null, 2));
    if (failure) {
      for (const managed of children) {
        const text = await readFile(managed.logFile, "utf8").catch(() => "");
        console.error(`--- ${managed.command} output (tail) ---\n${text.slice(-12_000)}`);
      }
    }
  }
  if (failure) throw failure;
}

// Importing this module in regression tests must not launch a desktop/daemon.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
