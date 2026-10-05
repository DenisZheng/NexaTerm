#!/usr/bin/env node
import { readFileSync } from "node:fs";

const workload = JSON.parse(readFileSync(new URL("../tests/performance/wf08d-workload.json", import.meta.url), "utf8"));
const probe = readFileSync(new URL("../src-tauri/src/performance_probe.rs", import.meta.url), "utf8");
const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const sampler = readFileSync(new URL("./perf-runtime-sampler.mjs", import.meta.url), "utf8");
const startupBoundary = readFileSync(new URL("./check-startup-module-boundary-source.mjs", import.meta.url), "utf8");

function fail(message) {
  throw new Error(`WF-08D performance/stability: ${message}`);
}
function requireAll(source, needles, label) {
  for (const needle of needles) {
    if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
  }
}

if (workload.schemaVersion !== 1) fail("workload schemaVersion must be 1");
if (workload.requirements.startupReviewTargetMs !== 2000) {
  fail("startup review target must reflect requirements §49 ~2s target");
}
if (workload.requirements.idleMemoryReviewRatio !== 1.25) {
  fail("idle memory review ratio must remain 1.25");
}
if ("idleCpuHardThresholdPercent" in workload.requirements) {
  fail("do not invent a hard idle CPU threshold before a real baseline exists");
}
if (workload.multiSession.sshSessions !== 10) {
  fail("multi-session workload must exercise exactly the required ten SSH sessions");
}
for (const surface of ["terminal", "split", "sftp", "transfer", "monitoring"]) {
  if (!workload.multiSession.requiredSurfaces.includes(surface)) {
    fail(`multi-session workload missing required surface: ${surface}`);
  }
}
if (workload.resourceRelease.cycles < 3) {
  fail("resource-release workload must repeat enough to expose monotonic growth");
}
if (!workload.comparison.mxtermBaselineRequiredForMemoryRatio) {
  fail("mXterm baseline must be required before applying the 25% memory review rule");
}

requireAll(probe, [
  '"NEXATERM_PERF_EVIDENCE_PATH"',
  '"NEXATERM_PERF_RUN_ID"',
  '"workspace-interactive"',
  "interactive_recorded",
], "Rust performance probe");
requireAll(lib, [
  "performance_probe::PerformanceProbeState::default()",
  "performance_probe::performance_probe_mark_interactive",
], "Tauri probe registration");
requireAll(commands, ["performanceProbeMarkInteractive"], "frontend performance bridge");
requireAll(app, [
  "function WorkspaceInteractiveMarker()",
  "void performanceProbeMarkInteractive().catch(() => undefined)",
  "<WorkspaceInteractiveMarker />",
], "workspace interactive mark");
if (workspace.includes("performanceProbeMarkInteractive")) {
  fail("performance probe must not grow WorkspaceShell; keep the marker at the lightweight App boundary");
}
requireAll(sampler, [
  "STARTUP_REVIEW_TARGET_MS = 2000",
  "IDLE_MEMORY_REVIEW_RATIO = 1.25",
  "processTree",
  "NEXATERM_PERF_EVIDENCE_PATH",
  "--baseline-rss-mb",
  '"review"',
], "runtime sampler");
requireAll(startupBoundary, [
  "WorkspaceShell must not statically import",
  "TerminalPanel must be lazy-loaded",
], "existing startup module boundary");

console.log("PASS  WF-08D performance/stability measurement contract");
