#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SUPPORTED_TARGETS = new Map([
  [
    "win-x64",
    {
      label: "Windows x64",
      command: ["pnpm", ["tauri", "build", "--bundles", "nsis"]],
    },
  ],
  [
    "mac-arm64",
    {
      label: "macOS Apple Silicon",
      command: [
        "pnpm",
        ["tauri", "build", "--target", "aarch64-apple-darwin", "--bundles", "app,dmg"],
      ],
    },
  ],
  [
    "linux-x64",
    {
      label: "Linux x64",
      command: [
        "pnpm",
        [
          "tauri",
          "build",
          "--target",
          "x86_64-unknown-linux-gnu",
          "--bundles",
          "deb,rpm,appimage",
        ],
      ],
    },
  ],
]);

const createUpdaterArtifactsEnv = "NEXATERM_CREATE_UPDATER_ARTIFACTS";
const legacyCreateUpdaterArtifactsEnv = "MXTERM_CREATE_UPDATER_ARTIFACTS";
const createUpdaterArtifactsConfig = JSON.stringify({
  bundle: {
    createUpdaterArtifacts: true,
  },
});

export function expandPlatformSelection(selection, runtime = process) {
  if (selection !== "all") {
    return [selection];
  }

  if (runtime.platform === "win32") {
    return ["win-x64"];
  }
  if (runtime.platform === "darwin") {
    return ["mac-arm64"];
  }
  if (runtime.platform === "linux") {
    return ["linux-x64"];
  }

  throw new Error(`Unsupported host platform: ${runtime.platform}`);
}

export function getBuildPlan(target) {
  const plan = SUPPORTED_TARGETS.get(target);
  if (!plan) {
    throw new Error(`Unsupported platform target: ${target}`);
  }
  return plan;
}

export function updaterArtifactsArgs(runtime = process, target) {
  const bundle = {};
  if (
    runtime.env?.[createUpdaterArtifactsEnv] === "1" ||
    runtime.env?.[legacyCreateUpdaterArtifactsEnv] === "1"
  ) {
    bundle.createUpdaterArtifacts = true;
  }

  const certificateThumbprint = runtime.env?.NEXATERM_WINDOWS_CERTIFICATE_THUMBPRINT?.trim();
  if (target === "win-x64" && certificateThumbprint) {
    bundle.windows = {
      certificateThumbprint,
      digestAlgorithm: "sha256",
      timestampUrl:
        runtime.env?.NEXATERM_WINDOWS_TIMESTAMP_URL?.trim() ||
        "http://timestamp.digicert.com",
    };
  }

  return Object.keys(bundle).length > 0
    ? ["--config", JSON.stringify({ bundle })]
    : [];
}

export function resolveSpawnInvocation(
  command,
  args,
  runtime = process,
  fileExists = existsSync,
) {
  if (runtime.platform !== "win32" || command !== "pnpm") {
    return { command, args };
  }

  const npmExecPath = runtime.env?.npm_execpath;
  if (
    typeof npmExecPath === "string" &&
    /(^|[\\/])pnpm(?:\.c?js|\.js)$/i.test(npmExecPath)
  ) {
    return {
      command: runtime.execPath,
      args: [npmExecPath, ...args],
    };
  }

  const pnpmHome = runtime.env?.PNPM_HOME;
  if (typeof pnpmHome === "string" && pnpmHome.trim()) {
    const actionSetupEntrypoint = win32.resolve(
      pnpmHome,
      "..",
      "pnpm",
      "bin",
      "pnpm.cjs",
    );
    if (fileExists(actionSetupEntrypoint)) {
      return {
        command: runtime.execPath,
        args: [actionSetupEntrypoint, ...args],
      };
    }
  }

  return {
    command: "pnpm.cmd",
    args,
  };
}

export function runPlan(target, { runtime = process, spawn = spawnSync } = {}) {
  const plan = getBuildPlan(target);
  const [command, args] = plan.command;
  const buildArgs = [...args, ...updaterArtifactsArgs(runtime, target)];
  const invocation = resolveSpawnInvocation(command, buildArgs, runtime);

  console.log(`\nBuilding ${plan.label}...`);
  console.log(`> ${invocation.command} ${invocation.args.join(" ")}`);

  const result = spawn(invocation.command, invocation.args, {
    cwd: runtime.cwd(),
    env: runtime.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `Failed to start ${invocation.command}: ${result.error.message || String(result.error)}`,
    );
  }

  if (result.status !== 0) {
    runtime.exit(result.status ?? 1);
  }
}

function main(argv = process.argv.slice(2)) {
  const selection = argv[0] ?? "all";
  for (const target of expandPlatformSelection(selection)) {
    runPlan(target);
  }
}

function isExecutedAsCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isExecutedAsCli()) {
  main();
}
