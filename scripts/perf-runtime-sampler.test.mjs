import assert from "node:assert/strict";
import test from "node:test";

import {
  IDLE_MEMORY_REVIEW_RATIO,
  STARTUP_REVIEW_TARGET_MS,
  intervalCpuPercent,
  parseCpuTime,
  parseUnixProcessTable,
  parseWindowsProcessJson,
  processTree,
  summarizeSamples,
} from "./perf-runtime-sampler.mjs";

test("parses Unix process rows and recursive descendants", () => {
  const rows = parseUnixProcessTable(`
  10 1 102400 00:00:10 nexaterm
  11 10 51200 00:00:04 WebKitWebProcess
  12 11 25600 00:00:01 helper
  99 1 9999 00:00:30 unrelated
  `);
  assert.equal(rows.length, 4);
  assert.deepEqual(processTree(rows, 10).map((row) => row.pid), [10, 11, 12]);
  assert.equal(parseCpuTime("1-01:02:03"), 90123);
});

test("parses Windows process JSON object or array", () => {
  const rows = parseWindowsProcessJson(
    JSON.stringify([
      { pid: 20, ppid: 1, rssKb: 1000, cpuSeconds: 1.5, name: "nexaterm" },
      { pid: 21, ppid: 20, rssKb: 2000, cpuSeconds: 0.5, name: "msedgewebview2" },
    ]),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].rssKb, 2000);
  assert.equal(parseWindowsProcessJson(JSON.stringify(rows[0])).length, 1);
});

test("CPU interval sums only continuing process CPU deltas", () => {
  const previous = {
    atMs: 1000,
    processes: [
      { pid: 1, cpuSeconds: 2 },
      { pid: 2, cpuSeconds: 4 },
    ],
  };
  const current = {
    atMs: 2000,
    processes: [
      { pid: 1, cpuSeconds: 2.25 },
      { pid: 2, cpuSeconds: 4.5 },
      { pid: 3, cpuSeconds: 10 },
    ],
  };
  assert.equal(intervalCpuPercent(previous, current), 75);
});

test("summary uses requirements review triggers without inventing an idle CPU threshold", () => {
  assert.equal(STARTUP_REVIEW_TARGET_MS, 2000);
  assert.equal(IDLE_MEMORY_REVIEW_RATIO, 1.25);
  const samples = [
    { rssMb: 120, cpuPercent: 0.4, processCount: 4 },
    { rssMb: 130, cpuPercent: 0.8, processCount: 5 },
    { rssMb: 140, cpuPercent: 0.6, processCount: 5 },
  ];
  const report = summarizeSamples(samples, { baselineRssMb: 100, startupMs: 2200 });
  assert.equal(report.status, "review");
  assert.ok(report.reviewReasons.includes("startup-over-2s-target"));
  assert.ok(report.reviewReasons.includes("idle-memory-over-25pct-mxterm-baseline"));
  assert.equal(report.idle.cpuAveragePercent, 0.6);
});
