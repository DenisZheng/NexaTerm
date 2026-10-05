#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const canonicalSidecarName = "nexaterm-mcp";
export const legacyCargoBinName = "mxterm-mcp";

export function sidecarExtension(targetTriple) {
  return /windows/i.test(targetTriple) ? ".exe" : "";
}

export function sidecarBuildPlan({
  rootDir = process.cwd(),
  targetTriple,
  debug = false,
} = {}) {
  if (!targetTriple?.trim()) {
    throw new Error("targetTriple is required");
  }
  const triple = targetTriple.trim();
  const profile = debug ? "debug" : "release";
  const extension = sidecarExtension(triple);
  const source = path.join(
    rootDir,
    "src-tauri",
    "target",
    triple,
    profile,
    `${legacyCargoBinName}${extension}`,
  );
  const destination = path.join(
    rootDir,
    "src-tauri",
    "binaries",
    `${canonicalSidecarName}-${triple}${extension}`,
  );
  const cargoArgs = [
    "build",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--bin",
    legacyCargoBinName,
    "--target",
    triple,
  ];
  if (!debug) cargoArgs.push("--release");
  return { cargoArgs, destination, profile, source, targetTriple: triple };
}

export function resolveTargetTriple(runtime = process) {
  const fromTauri = runtime.env?.TAURI_ENV_TARGET_TRIPLE?.trim();
  if (fromTauri) return fromTauri;

  try {
    const output = execFileSync("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (output) return output;
  } catch {
    const verbose = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
    const host = verbose.match(/^host:\s*(\S+)/m)?.[1];
    if (host) return host;
  }
  throw new Error("Unable to resolve Rust target triple");
}

export function prepareSidecar(runtime = process) {
  const targetTriple = resolveTargetTriple(runtime);
  const debug = runtime.env?.TAURI_ENV_DEBUG === "true";
  const plan = sidecarBuildPlan({ rootDir: runtime.cwd(), targetTriple, debug });

  const cargo = spawnSync("cargo", plan.cargoArgs, {
    cwd: runtime.cwd(),
    env: runtime.env,
    stdio: "inherit",
  });
  if (cargo.status !== 0) {
    throw new Error(`cargo build for ${targetTriple} failed with status ${cargo.status}`);
  }

  mkdirSync(path.dirname(plan.destination), { recursive: true });
  copyFileSync(plan.source, plan.destination);
  if (!/windows/i.test(targetTriple)) {
    chmodSync(plan.destination, statSync(plan.source).mode);
  }
  console.log(`Prepared NexaTerm MCP sidecar: ${plan.destination}`);
  return plan;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    prepareSidecar();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
