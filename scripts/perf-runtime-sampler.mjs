#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const STARTUP_REVIEW_TARGET_MS = 2000;
export const IDLE_MEMORY_REVIEW_RATIO = 1.25;

export function parseCpuTime(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const [dayPart, clockPart] = text.includes("-") ? text.split("-", 2) : [null, text];
  const parts = clockPart.split(":").map(Number);
  if (parts.some((item) => !Number.isFinite(item))) return 0;
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  if (dayPart != null) {
    const days = Number(dayPart);
    if (Number.isFinite(days)) seconds += days * 86400;
  }
  return seconds;
}

export function parseUnixProcessTable(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKb: Number(match[3]),
        cpuSeconds: parseCpuTime(match[4]),
        name: match[5].trim(),
      };
    })
    .filter(Boolean);
}

export function parseWindowsProcessJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row.pid ?? row.Pid ?? row.ProcessId),
      ppid: Number(row.ppid ?? row.Ppid ?? row.ParentProcessId),
      rssKb: Number(row.rssKb ?? row.RssKb ?? row.rss_kb ?? 0),
      cpuSeconds: Number(row.cpuSeconds ?? row.CpuSeconds ?? row.cpu_seconds ?? 0),
      name: String(row.name ?? row.Name ?? ""),
    }))
    .filter((row) => Number.isFinite(row.pid) && Number.isFinite(row.ppid));
}

export function processTree(rows, rootPid) {
  const wanted = new Set([Number(rootPid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!wanted.has(row.pid) && wanted.has(row.ppid)) {
        wanted.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => wanted.has(row.pid));
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function intervalCpuPercent(previous, current) {
  if (!previous || !current) return 0;
  const elapsedSeconds = (current.atMs - previous.atMs) / 1000;
  if (elapsedSeconds <= 0) return 0;
  const previousByPid = new Map(previous.processes.map((item) => [item.pid, item.cpuSeconds]));
  let deltaCpuSeconds = 0;
  for (const item of current.processes) {
    const before = previousByPid.get(item.pid);
    if (before == null) continue;
    deltaCpuSeconds += Math.max(0, item.cpuSeconds - before);
  }
  return (deltaCpuSeconds / elapsedSeconds) * 100;
}

export function summarizeSamples(samples, { baselineRssMb = null, startupMs = null } = {}) {
  const rss = samples.map((sample) => sample.rssMb).filter(Number.isFinite);
  const cpu = samples.map((sample) => sample.cpuPercent).filter(Number.isFinite);
  const processCounts = samples.map((sample) => sample.processCount).filter(Number.isFinite);
  const medianRssMb = percentile(rss, 0.5);
  const memoryRatio =
    baselineRssMb && medianRssMb != null && baselineRssMb > 0
      ? medianRssMb / baselineRssMb
      : null;
  const reviewReasons = [];
  if (startupMs != null && startupMs > STARTUP_REVIEW_TARGET_MS) {
    reviewReasons.push("startup-over-2s-target");
  }
  if (memoryRatio != null && memoryRatio > IDLE_MEMORY_REVIEW_RATIO) {
    reviewReasons.push("idle-memory-over-25pct-mxterm-baseline");
  }
  return {
    status: reviewReasons.length ? "review" : "recorded",
    reviewReasons,
    startupMs,
    startupReviewTargetMs: STARTUP_REVIEW_TARGET_MS,
    baselineRssMb,
    memoryReviewRatio: IDLE_MEMORY_REVIEW_RATIO,
    measuredMemoryRatio: round(memoryRatio, 3),
    idle: {
      sampleCount: samples.length,
      rssMedianMb: round(medianRssMb),
      rssP95Mb: round(percentile(rss, 0.95)),
      rssMaxMb: round(rss.length ? Math.max(...rss) : null),
      cpuAveragePercent: round(mean(cpu)),
      cpuP95Percent: round(percentile(cpu, 0.95)),
      processCountMedian: round(percentile(processCounts, 0.5)),
      processCountMax: processCounts.length ? Math.max(...processCounts) : null,
    },
  };
}

function windowsProcessRows() {
  const script = [
    "$rows = Get-CimInstance Win32_Process | ForEach-Object {",
    "  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;",
    "  if ($null -ne $p) {",
    "    $cpu = if ($null -eq $p.CPU) { 0 } else { [double]$p.CPU };",
    "    [PSCustomObject]@{",
    "      pid = [int]$_.ProcessId;",
    "      ppid = [int]$_.ParentProcessId;",
    "      rssKb = [math]::Round([double]$p.WorkingSet64 / 1KB);",
    "      cpuSeconds = $cpu;",
    "      name = [string]$p.ProcessName",
    "    }",
    "  }",
    "};",
    "$rows | ConvertTo-Json -Compress",
  ].join(" ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`PowerShell process sample failed: ${result.stderr || result.status}`);
  }
  return parseWindowsProcessJson(result.stdout);
}

function unixProcessRows() {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,rss=,time=,comm="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ps process sample failed: ${result.stderr || result.status}`);
  }
  return parseUnixProcessTable(result.stdout);
}

export function sampleProcessTree(rootPid, platform = process.platform) {
  const rows = platform === "win32" ? windowsProcessRows() : unixProcessRows();
  return processTree(rows, rootPid);
}

function aggregateRawSample(processes, atMs, previous) {
  const current = { atMs, processes };
  const rssKb = processes.reduce((sum, item) => sum + Math.max(0, item.rssKb || 0), 0);
  return {
    current,
    publicSample: {
      atMs,
      processCount: processes.length,
      rssMb: rssKb / 1024,
      cpuPercent: intervalCpuPercent(previous, current),
    },
  };
}

function parseArgs(argv) {
  const options = {
    executable: "",
    args: [],
    durationMs: 30000,
    warmupMs: 5000,
    sampleMs: 1000,
    output: "",
    label: "nexaterm-idle",
    baselineRssMb: null,
    keepOpen: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value after ${value}`);
      return argv[index];
    };
    if (value === "--executable") options.executable = next();
    else if (value === "--args-json") options.args = JSON.parse(next());
    else if (value === "--duration-ms") options.durationMs = Number(next());
    else if (value === "--warmup-ms") options.warmupMs = Number(next());
    else if (value === "--sample-ms") options.sampleMs = Number(next());
    else if (value === "--output") options.output = next();
    else if (value === "--label") options.label = next();
    else if (value === "--baseline-rss-mb") options.baselineRssMb = Number(next());
    else if (value === "--keep-open") options.keepOpen = true;
    else if (value === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readStartupMs(evidencePath, runId) {
  try {
    const lines = readFileSync(evidencePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const event = lines.find(
      (item) => item.event === "workspace-interactive" && item.runId === runId,
    );
    return event ? Number(event.elapsedMs) : null;
  } catch {
    return null;
  }
}

function terminateProcessTree(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function runBenchmark(options) {
  if (!options.executable) {
    throw new Error("--executable is required");
  }
  if (!Array.isArray(options.args)) {
    throw new Error("--args-json must decode to an array");
  }
  if (![options.durationMs, options.warmupMs, options.sampleMs].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("duration/warmup/sample values must be non-negative numbers");
  }
  if (options.sampleMs < 100) {
    throw new Error("--sample-ms must be at least 100ms");
  }

  const runId = randomUUID();
  const output = options.output || path.join("logs", "performance", `wf08d-${runId}.json`);
  const startupEvidence = output.replace(/\.json$/i, ".startup.jsonl");
  mkdirSync(path.dirname(output), { recursive: true });

  const child = spawn(options.executable, options.args.map(String), {
    env: {
      ...process.env,
      NEXATERM_PERF_EVIDENCE_PATH: path.resolve(startupEvidence),
      NEXATERM_PERF_RUN_ID: runId,
    },
    stdio: "ignore",
    windowsHide: false,
  });

  const samples = [];
  const raw = [];
  let previous = null;
  const startedAt = Date.now();
  const sampleUntil = startedAt + options.warmupMs + options.durationMs;

  try {
    while (Date.now() < sampleUntil && child.exitCode == null) {
      const now = Date.now();
      let processes = [];
      try {
        processes = sampleProcessTree(child.pid);
      } catch (error) {
        raw.push({ atMs: now - startedAt, sampleError: String(error) });
      }
      if (processes.length) {
        const aggregated = aggregateRawSample(processes, now - startedAt, previous);
        previous = aggregated.current;
        raw.push({
          atMs: now - startedAt,
          processCount: processes.length,
          rssMb: round(aggregated.publicSample.rssMb),
          cpuPercent: round(aggregated.publicSample.cpuPercent),
        });
        if (now - startedAt >= options.warmupMs) {
          samples.push(aggregated.publicSample);
        }
      }
      await sleep(options.sampleMs);
    }
  } finally {
    if (!options.keepOpen) {
      terminateProcessTree(child);
    }
  }

  const startupMs = readStartupMs(startupEvidence, runId);
  const summary = summarizeSamples(samples, {
    baselineRssMb: options.baselineRssMb,
    startupMs,
  });
  const report = {
    schemaVersion: 1,
    runId,
    label: options.label,
    platform: process.platform,
    arch: process.arch,
    logicalCpuCount: os.cpus().length,
    executable: path.resolve(options.executable),
    args: options.args,
    warmupMs: options.warmupMs,
    durationMs: options.durationMs,
    sampleMs: options.sampleMs,
    childPid: child.pid,
    childExitCode: child.exitCode,
    startupEvidence: path.resolve(startupEvidence),
    ...summary,
    samples: raw,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: path.resolve(output), ...summary }, null, 2)}\n`);
  return report;
}

function help() {
  return [
    "Usage: node scripts/perf-runtime-sampler.mjs --executable <path> [options]",
    "",
    "Options:",
    "  --args-json <json-array>       Arguments passed to the app",
    "  --warmup-ms <ms>               Wait before idle samples count (default 5000)",
    "  --duration-ms <ms>             Idle measurement duration (default 30000)",
    "  --sample-ms <ms>               Process-tree sample cadence (default 1000)",
    "  --baseline-rss-mb <mb>         mXterm idle baseline for the 1.25 review rule",
    "  --output <file>                 JSON report path",
    "  --label <name>                  Evidence label",
    "  --keep-open                     Do not terminate the launched app",
  ].join("\n");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
  } else {
    runBenchmark(options).catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
  }
}
