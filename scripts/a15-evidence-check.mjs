#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REQUIRED_STATUS = "pass";
export const PLATFORM_KEYS = ["windows-x64", "macos-arm64", "linux-x64"];

export function collectA15Blockers(evidence) {
  const blockers = [];
  const requirePass = (value, label) => {
    if (value !== REQUIRED_STATUS) blockers.push({ label, status: value ?? "missing" });
  };

  requirePass(evidence?.predecessor?.A09, "A09 MultiExec live fixed-target real Tauri");
  requirePass(evidence?.predecessor?.A10, "A10 MultiExec disconnect/reconnect real Tauri");

  requirePass(evidence?.automated?.finalCi, "final CI");
  requirePass(evidence?.automated?.securityCriticalHigh, "Critical/High security audit");
  requirePass(evidence?.automated?.license, "license audit");

  for (const platform of PLATFORM_KEYS) {
    const item = evidence?.platforms?.[platform];
    requirePass(item?.build, `${platform} build`);
    requirePass(item?.install, `${platform} install`);
    requirePass(item?.launch, `${platform} launch`);
    requirePass(item?.brand, `${platform} NexaTerm brand surface`);
    requirePass(item?.locale, `${platform} English/zh-CN switch`);
    requirePass(item?.theme, `${platform} Light/Dark switch`);
    requirePass(item?.upgrade, `${platform} upgrade`);
    requirePass(item?.rollback, `${platform} rollback`);
    requirePass(item?.artifactHash, `${platform} artifact hash`);
  }

  requirePass(evidence?.platforms?.["windows-x64"]?.authenticode, "Windows Authenticode");
  requirePass(evidence?.platforms?.["macos-arm64"]?.developerId, "macOS Developer ID");
  requirePass(evidence?.platforms?.["macos-arm64"]?.notarization, "macOS notarization/staple");

  requirePass(evidence?.migration?.coreAppData, "mXterm core App Data migration");
  requirePass(evidence?.migration?.webviewSettings, "mXterm WebView settings migration");
  requirePass(evidence?.migration?.noSilentOverwrite, "migration no-silent-overwrite");
  requirePass(evidence?.migration?.vault, "Vault migration");
  requirePass(evidence?.migration?.rollback, "migration rollback");

  requirePass(evidence?.performance?.startup, "packaged startup benchmark");
  requirePass(evidence?.performance?.idleCpu, "idle CPU review");
  requirePass(evidence?.performance?.memoryVsMxterm, "idle memory vs mXterm");
  requirePass(evidence?.performance?.tenSshWorkload, "10 SSH + Split/SFTP/Transfer/Monitoring");
  requirePass(evidence?.performance?.resourceRelease, "resource release / long-run");
  requirePass(evidence?.performance?.failureIsolation, "failure isolation");

  requirePass(evidence?.updater?.signedMetadata, "signed updater metadata");
  requirePass(evidence?.updater?.upgrade, "updater upgrade");
  requirePass(evidence?.updater?.rollbackRecovery, "updater rollback/recovery");

  return blockers;
}

export function evaluateA15Evidence(evidence) {
  const blockers = collectA15Blockers(evidence);
  const declared = evidence?.signoff?.status ?? "pending";
  const eligible = blockers.length === 0;
  return {
    eligible,
    declared,
    blockers,
    validSignoff: eligible && declared === "pass",
  };
}

function main(argv = process.argv.slice(2)) {
  const file = argv[0];
  if (!file) {
    throw new Error("Usage: node scripts/a15-evidence-check.mjs <evidence.json> [--allow-pending]");
  }
  const allowPending = argv.includes("--allow-pending");
  const evidence = JSON.parse(readFileSync(file, "utf8"));
  const result = evaluateA15Evidence(evidence);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.eligible && evidence?.signoff?.status !== "pass") {
    throw new Error("All A15 gates are satisfied, but signoff.status is not pass");
  }
  if (!result.eligible && evidence?.signoff?.status === "pass") {
    throw new Error("A15 signoff cannot be pass while blockers remain");
  }
  if (!allowPending && !result.validSignoff) {
    throw new Error(`A15 is not ready: ${result.blockers.length} blocker(s) remain`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
