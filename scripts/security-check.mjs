import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSpawnInvocation } from "./build-platform.mjs";
import { SecurityCheckError, isReviewedFixture, normalizeNpmAudit, normalizeRustAudit,
  normalizeSecrets, parseJson, requireCheck } from "./security-report.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tools = parseJson(readFileSync(new URL("./security-tools.json", import.meta.url), "utf8"));

export function execute(command, args, { cwd, spawn = spawnSync } = {}) {
  const invocation = resolveSpawnInvocation(command, args);
  const result = spawn(invocation.command, invocation.args, {
    cwd, shell: false, windowsHide: true, encoding: "utf8", timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.signal || result.status === null) {
    throw new SecurityCheckError(result.error?.code === "ENOENT" ? "tool_missing" : "tool_execution_failed",
      result.error?.code === "ENOENT");
  }
  return result;
}

function git(root, args) {
  const result = execute("git", args, { cwd: root });
  requireCheck(result.status === 0, "git_command_failed");
  return result.stdout;
}

function version(command, args, expected, root) {
  const result = execute(command, args, { cwd: root });
  requireCheck(result.status === 0, "tool_version_failed");
  const value = result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
  requireCheck(value && (!expected || value === expected), "tool_version_mismatch");
  return value;
}

function metadata(root) {
  const sha = git(root, ["rev-parse", "HEAD"]).trim();
  requireCheck(/^[a-f0-9]{40,64}$/.test(sha), "invalid_head_sha");
  const hashes = {};
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock",
    ".gitleaks.toml", "scripts/security-reviewed-fixtures.json", "scripts/security-deny.toml", "scripts/security-tools.json"]) {
    if (existsSync(path.join(root, file))) {
      // lockfile 哈希基于原始字节，不做 EOL 或文本正规化。
      hashes[file] = createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex");
    }
  }
  return { commit: sha, trackedChanges: Boolean(git(root, ["status", "--porcelain", "--untracked-files=no"]).trim()),
    node: process.versions.node, hashes };
}

function copyTrackedFiles(root, destination) {
  const entries = git(root, ["ls-files", "--stage", "-z"]).split("\0").filter(Boolean);
  let copied = 0;
  for (const entry of entries) {
    const match = entry.match(/^(\d+) [a-f0-9]+ (\d)\t([\s\S]+)$/);
    requireCheck(match && match[2] === "0", "unmerged_git_index");
    requireCheck(match[1] !== "160000", "submodule_scan_not_supported");
    requireCheck(match[1] !== "120000", "symlink_scan_not_supported");
    const file = match[3];
    const source = path.resolve(root, file);
    const relative = path.relative(root, source);
    requireCheck(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "invalid_tracked_path");
    if (!existsSync(source)) continue; // 工作树中已删除的文件仍由历史扫描覆盖。
    requireCheck(lstatSync(source).isFile(), "symlink_scan_not_supported");
    // 不允许经由已替换成符号链接的父目录读取仓库以外的文件。
    let parent = path.dirname(source);
    while (parent !== root) {
      requireCheck(!lstatSync(parent).isSymbolicLink(), "symlink_scan_not_supported");
      parent = path.dirname(parent);
    }
    const target = path.join(destination, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied += 1;
  }
  requireCheck(copied > 0, "empty_tracked_snapshot");
  return copied;
}

function scanSecrets(root, report) {
  requireCheck(git(root, ["rev-parse", "--is-shallow-repository"]).trim() === "false", "shallow_history_not_allowed");
  const command = process.env.GITLEAKS_BIN || "gitleaks";
  report.tool = { name: "gitleaks", version: version(command, ["version"], tools.gitleaks.version, root) };
  report.scope = { history: "all reachable local refs and HEAD, including merge diffs", current: "tracked working-tree files" };
  report.commands = ["gitleaks git --log-opts='--all --full-history -m --no-ext-diff --no-textconv' --redact=100",
    "gitleaks dir <tracked-snapshot> --redact=100"];
  const fixtures = parseJson(readFileSync(new URL("./security-reviewed-fixtures.json", import.meta.url), "utf8"));
  requireCheck(Array.isArray(fixtures), "invalid_fixture_policy");
  const temporary = mkdtempSync(path.join(tmpdir(), "nexaterm-secret-scan-"));
  try {
    const snapshot = path.join(temporary, "snapshot");
    mkdirSync(snapshot);
    report.scope.files = copyTrackedFiles(root, snapshot);
    report.scope.commits = Number(git(root, ["rev-list", "--count", "--all", "HEAD"]).trim());
    report.findings = [];
    report.reviewedFixtures = [];
    report.scanExitCodes = {};
    for (const mode of ["git", "dir"]) {
      const output = path.join(temporary, `${mode}.json`);
      const args = [mode, "--config", path.join(projectRoot, ".gitleaks.toml"), "--redact=100", "--no-banner",
        "--log-level", "error", "--exit-code", "10", "--ignore-gitleaks-allow", "--gitleaks-ignore-path", temporary,
        "--report-format", "json", "--report-path", output];
      if (mode === "git") args.push("--log-opts=--all --full-history -m --no-ext-diff --no-textconv", root);
      else args.push(".");
      const result = execute(command, args, { cwd: mode === "git" ? root : snapshot });
      report.scanExitCodes[mode] = result.status;
      requireCheck([0, 10].includes(result.status), "secret_scan_tool_error");
      requireCheck(existsSync(output), "missing_secret_report");
      const findings = normalizeSecrets(parseJson(readFileSync(output, "utf8")), result.status);
      for (const finding of findings) {
        const local = path.resolve(snapshot, finding.file);
        requireCheck(!path.isAbsolute(finding.file) && !path.relative(snapshot, local).startsWith(".."), "invalid_secret_path");
        const source = mode === "git"
          ? git(root, ["show", `${finding.commit}:${finding.file}`])
          : readFileSync(local, "utf8");
        if (isReviewedFixture(finding, source, fixtures)) {
          report.reviewedFixtures.push({ ...finding, scope: mode });
        } else {
          report.findings.push({ ...finding, scope: mode });
        }
      }
    }
    report.status = report.findings.length ? "FAIL" : "PASS";
  } finally {
    // 临时文件包含原始报告结构，永不上传；失败同样清理。
    rmSync(temporary, { recursive: true, force: true });
  }
}

function auditNpm(root, report) {
  const windows = process.platform === "win32";
  const bridge = path.join(projectRoot, "scripts/invoke-pnpm-audit.ps1");
  const command = windows ? "pwsh" : "pnpm";
  const prefix = windows ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", bridge] : [];
  report.tool = { name: "pnpm", version: version(command, [...prefix, windows ? "-Version" : "--version"], "11.22.0", root) };
  report.command = "pnpm --registry=https://registry.npmjs.org audit --json";
  report.policy = "report-only; REVIEW-REQUIRED is not security acceptance";
  const args = windows ? prefix : ["--registry=https://registry.npmjs.org", "audit", "--json"];
  const result = execute(command, args, { cwd: root });
  report.toolExitCode = result.status;
  Object.assign(report, normalizeNpmAudit(parseJson(result.stdout), result.status));
}

function auditRust(root, report) {
  const command = process.env.CARGO_DENY_BIN || "cargo-deny";
  report.tool = { name: "cargo-deny", version: version(command, ["--version"], tools["cargo-deny"].version, root),
    cargo: version("cargo", ["--version"], null, root) };
  report.command = "cargo-deny --manifest-path src-tauri/Cargo.toml --config scripts/security-deny.toml --workspace --locked --format json check --show-stats advisories";
  report.policy = "report-only; cargo-deny advisories is not cargo-audit or a license audit";
  report.source = "https://github.com/RustSec/advisory-db";
  report.databaseFetchCommand = "cargo-deny --config scripts/security-deny.toml fetch db";
  const fetchResult = execute(command, ["--manifest-path", path.join(root, "src-tauri/Cargo.toml"),
    "--config", path.join(projectRoot, "scripts/security-deny.toml"), "--format", "json", "fetch", "db"], { cwd: root });
  report.databaseFetchExitCode = fetchResult.status;
  requireCheck(fetchResult.status === 0, "rust_advisory_fetch_failed");
  const result = execute(command, ["--manifest-path", path.join(root, "src-tauri/Cargo.toml"), "--config",
    path.join(projectRoot, "scripts/security-deny.toml"), "--workspace", "--locked", "--format", "json",
    "check", "--show-stats", "advisories"], { cwd: root });
  report.toolExitCode = result.status;
  Object.assign(report, normalizeRustAudit(result.stderr, result.status));
}

export function runSecurityCheck(kind, root = process.cwd()) {
  requireCheck(["secrets", "npm", "rust"].includes(kind), "unknown_security_check");
  root = path.resolve(root);
  const directory = path.join(root, "logs/security");
  mkdirSync(directory, { recursive: true });
  const report = { schemaVersion: 1, check: kind, collectedAt: new Date().toISOString(), status: "FAIL" };
  try {
    report.context = metadata(root);
    ({ secrets: scanSecrets, npm: auditNpm, rust: auditRust })[kind](root, report);
  } catch (error) {
    report.status = error instanceof SecurityCheckError && error.environment ? "ENVIRONMENT-BLOCKED" : "FAIL";
    report.error = error instanceof SecurityCheckError ? error.code : "security_check_io_error";
  }
  writeFileSync(path.join(directory, `${kind}.json`), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = runSecurityCheck(process.argv[2]);
    console.log(`${report.status}: ${report.check}; findings=${report.findings?.length ?? "unknown"}${report.error ? `; error=${report.error}` : ""}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### Security: ${report.check}\n\n- 状态：${report.status}\n- 发现：${report.findings?.length ?? "未知"}\n- REVIEW-REQUIRED 只代表报告已采集，不代表风险接受或安全验收。\n\n`);
    }
    process.exitCode = ["PASS", "REVIEW-REQUIRED"].includes(report.status) ? 0 : 1;
  } catch {
    console.error("FAIL: 无法运行安全检查或写入报告。");
    process.exitCode = 1;
  }
}
