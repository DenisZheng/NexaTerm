import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  assertProcessesAlive, inputMethodCommand, SmokeFatalError, startProcess,
  startupTimeouts, stopProcesses, waitFor,
} from "./linux-ime-smoke.mjs";

function clock() {
  let tick = 0;
  return { now: () => tick, pause: async (ms) => { tick += ms; }, intervalMs: 1 };
}

test("successful polls clear an old connection-refused error", async () => {
  let calls = 0;
  await assert.rejects(waitFor(() => {
    if (calls++ === 0) throw new Error("fetch failed: ECONNREFUSED");
    return false;
  }, "page ready", 3, clock()), (error) => {
    assert.equal(error.message, "Timed out waiting for page ready");
    return true;
  });
});

test("persistent network failures retain the latest useful error", async () => {
  await assert.rejects(waitFor(() => { throw new Error("HTTP 503"); }, "server", 3, clock()), /server: HTTP 503/);
});

test("transient errors can recover and return the predicate value", async () => {
  let calls = 0;
  assert.equal(await waitFor(() => {
    if (calls++ === 0) throw new Error("not listening yet");
    return "ready";
  }, "server", 3, clock()), "ready");
});

test("browser bootstrap errors fail immediately, not after a readiness timeout", async () => {
  let calls = 0;
  await assert.rejects(waitFor(() => {
    calls += 1;
    throw new SmokeFatalError("bootstrap-error: module failed");
  }, "page", 100, clock()), /bootstrap-error: module failed/);
  assert.equal(calls, 1);
});

test("dead-process health checks fail before the next network probe", async () => {
  let polled = false;
  await assert.rejects(waitFor(() => { polled = true; return true; }, "page", 100, {
    ...clock(), checkHealth: () => { throw new SmokeFatalError("tauri exited"); },
  }), /tauri exited/);
  assert.equal(polled, false);
});

test("native compilation does not spend the separate short page timeout", async () => {
  assert.ok(startupTimeouts.nativeWindow > 180_000);
  assert.ok(startupTimeouts.page <= 60_000);
  const options = clock();
  await waitFor(() => options.now() > 180_000, "cold build", startupTimeouts.nativeWindow, {
    ...options, intervalMs: 60_000,
  });
  const pageStart = options.now();
  await waitFor(() => options.now() - pageStart >= 1_000, "page", startupTimeouts.page, {
    ...options, intervalMs: 1_000,
  });
});

test("both daemon launch plans stay in the managed foreground process", () => {
  assert.deepEqual(inputMethodCommand("ibus"), ["ibus-daemon", ["--replace", "--xim"]]);
  assert.deepEqual(inputMethodCommand("fcitx5"), ["fcitx5", ["-D", "--replace"]]);
  assert.throws(() => inputMethodCommand("other"), /Unsupported/);
});

async function withLog(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ime-process-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "process.log");
}

test("a live daemon logs without blocking the supervisor", { timeout: 8_000 }, async (t) => {
  const log = await withLog(t);
  const managed = startProcess(process.execPath, ["-e", "console.log('ready'); setInterval(() => {}, 1000)"], log);
  t.after(() => stopProcesses([managed]));
  // A synchronous daemon launch would never reach this polling loop.
  await waitFor(async () => (await readFile(log, "utf8")).includes("ready"), "daemon", 5_000, {
    checkHealth: () => assertProcessesAlive([managed]), intervalMs: 20,
  });
  assert.equal(managed.child.stdout, null);
  assert.equal(managed.child.stderr, null);
  assertProcessesAlive([managed]);
});

test("even a clean premature launcher exit is a fatal startup failure", { timeout: 8_000 }, async (t) => {
  const managed = startProcess(process.execPath, ["-e", "process.exit(0)"], await withLog(t));
  await once(managed.child, "exit");
  assert.throws(() => assertProcessesAlive([managed]), /exited \(code=0/);
});

test("missing commands are captured instead of becoming unhandled spawn errors", { timeout: 8_000 }, async (t) => {
  const managed = startProcess(path.join(os.tmpdir(), "nexaterm-missing-ime-command"), [], await withLog(t));
  await once(managed.child, "error");
  assert.throws(() => assertProcessesAlive([managed]), /ENOENT/);
});

test("cleanup terminates a live owned daemon", { timeout: 8_000 }, async (t) => {
  const managed = startProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], await withLog(t));
  const exited = once(managed.child, "exit");
  await stopProcesses([managed]);
  await exited;
  assert.throws(() => assertProcessesAlive([managed]), /exited/);
});
