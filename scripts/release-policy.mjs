#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const number = "(?:0|[1-9][0-9]*)";
const versionPattern = new RegExp(`^${number}\\.${number}\\.${number}(?:-(alpha|beta|rc)\\.${number})?$`);

/** 所有发布阶段共用同一通道判定；未知 tag 不得退化为无签名预发布。 */
export function releasePolicy({ ref, eventName, versions }) {
  const version = versions.package;
  const match = typeof version === "string" && versionPattern.exec(version);
  if (!match || match[0] !== version) throw new Error("Unsupported release version; use X.Y.Z or X.Y.Z-(alpha|beta|rc).N");
  for (const key of ["tauri", "cargo"]) {
    if (versions[key] !== version) throw new Error(`${key} version does not match package.json`);
  }
  const tagged = ref.startsWith("refs/tags/");
  if (tagged) {
    if (ref !== `refs/tags/v${version}`) throw new Error("Tag does not match package.json version");
  } else if (eventName !== "workflow_dispatch" || !ref.startsWith("refs/heads/")) {
    throw new Error("Only version tags or manual branch builds are supported");
  }
  if (!["push", "workflow_dispatch"].includes(eventName)) throw new Error("Unsupported release event");
  const prerelease = Boolean(match[1]);
  return {
    version,
    tag: `v${version}`,
    publish: tagged,
    prerelease,
    platformSigning: tagged && !prerelease,
    draft: tagged && prerelease,
    makeLatest: tagged && !prerelease ? "legacy" : "false",
  };
}

function main() {
  const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").split("\n[lib]")[0];
  const policy = releasePolicy({
    ref: process.env.GITHUB_REF ?? "",
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    versions: {
      package: readJson("package.json").version,
      tauri: readJson("src-tauri/tauri.conf.json").version,
      cargo: cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    },
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(policy).map(([k, v]) => `${k}=${v}\n`).join(""));
  console.log(JSON.stringify(policy));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
