import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execute, runSecurityCheck } from "./security-check.mjs";
import { SecurityCheckError, isReviewedFixture, normalizeNpmAudit, normalizeRustAudit,
  normalizeSecrets, parseJson, sourceHash } from "./security-report.mjs";

const sensitive = "SENSITIVE_SENTINEL_DO_NOT_EXPORT";
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
function npmReport() {
  return { metadata: { vulnerabilities: { ...counts, high: 1 } }, advisories: {
    fixture: { id: 12345, github_advisory_id: "GHSA-aaaa-bbbb-cccc", module_name: "test-package", severity: "high",
      vulnerable_versions: "<2.0.0", patched_versions: ">=2.0.0", title: sensitive,
      findings: [{ version: "1.0.0", dev: true, paths: ["root>test-package"], arbitrary: sensitive }] },
  } };
}
function rustReport({ errors = 1, severity = "error", category = "vulnerability" } = {}) {
  return [
    { type: "diagnostic", fields: { code: category, severity, message: sensitive, labels: [sensitive], notes: [sensitive],
      advisory: { id: "RUSTSEC-2026-9999", cvss: null, description: sensitive },
      graphs: [{ Krate: { name: "test-crate", version: "1.0.0", source: sensitive }, parents: [] }] } },
    { type: "summary", fields: { advisories: { errors, warnings: severity === "warning" ? 1 : 0, helps: 0, notes: 0 } } },
  ].map(JSON.stringify).join("\n");
}

test("secret reports contain only location metadata and findings block", () => {
  const raw = [{ RuleID: "test-rule", File: "src/file.rs", StartLine: 1, EndLine: 1, Commit: "a".repeat(40),
    Match: sensitive, Secret: sensitive, Author: sensitive, Message: sensitive }];
  assert.deepEqual(normalizeSecrets(raw, 10)[0], { rule: "test-rule", file: "src/file.rs", startLine: 1, endLine: 1, commit: "a".repeat(40) });
  assert.ok(!JSON.stringify(normalizeSecrets(raw, 10)).includes(sensitive));
  assert.throws(() => normalizeSecrets(raw, 0), /secret_scan_exit_mismatch/);
  assert.throws(() => normalizeSecrets([], 10), /secret_scan_exit_mismatch/);
  assert.deepEqual(normalizeSecrets([], 0), []);
});

test("reviewed fixtures bind rule, file and exact source bytes, not a directory or line number", () => {
  const source = "before\nsynthetic fixture\nafter";
  const finding = { rule: "fixture-rule", file: "src/test.rs", startLine: 2, endLine: 2 };
  const policy = [{ rule: finding.rule, file: finding.file, sourceSha256: sourceHash("synthetic fixture"), reason: "固定测试输入" }];
  assert.equal(isReviewedFixture(finding, source, policy), true);
  assert.equal(isReviewedFixture(finding, source.replaceAll("\n", "\r\n"), policy), true);
  assert.equal(isReviewedFixture(finding, source.replace("fixture", "changed value"), policy), false);
  assert.equal(isReviewedFixture({ ...finding, rule: "new-rule" }, source, policy), false);
  assert.equal(isReviewedFixture({ ...finding, file: "src/production.rs" }, source, policy), false);
});

test("npm findings remain REVIEW-REQUIRED without exporting arbitrary report fields", () => {
  const result = normalizeNpmAudit(npmReport(), 1);
  assert.equal(result.status, "REVIEW-REQUIRED");
  assert.equal(result.counts.high, 1);
  assert.equal(result.findings[0].dependencies[0].dev, true);
  assert.ok(!JSON.stringify(result).includes(sensitive));
  assert.equal(normalizeNpmAudit({ advisories: {}, metadata: { vulnerabilities: counts } }, 0).status, "PASS");
});

test("npm accepts missing inferred fix range and absent GHSA URL while preserving registry identity", () => {
  const raw = npmReport();
  raw.advisories.fixture.vulnerable_versions = "*";
  delete raw.advisories.fixture.patched_versions;
  const withoutFix = normalizeNpmAudit(raw, 1);
  assert.equal(withoutFix.status, "REVIEW-REQUIRED");
  assert.equal(withoutFix.findings[0].patchedVersions, null);
  assert.equal(withoutFix.findings[0].id, "GHSA-aaaa-bbbb-cccc");
  raw.advisories.fixture.github_advisory_id = "";
  const withoutGhsa = normalizeNpmAudit(raw, 1);
  assert.equal(withoutGhsa.status, "REVIEW-REQUIRED");
  assert.equal(withoutGhsa.findings[0].id, null);
  assert.equal(withoutGhsa.findings[0].registryId, 12345);
});

test("npm checks severity counts against advisories rather than only testing for a nonzero total", () => {
  const wrongSeverity = npmReport();
  wrongSeverity.metadata.vulnerabilities.high = 0;
  wrongSeverity.metadata.vulnerabilities.low = 1;
  assert.throws(() => normalizeNpmAudit(wrongSeverity, 1), /npm_counts_mismatch/);
  const wrongTotal = npmReport();
  wrongTotal.metadata.vulnerabilities.high = 2;
  assert.throws(() => normalizeNpmAudit(wrongTotal, 1), /npm_counts_mismatch/);
  const multipleVersions = npmReport();
  multipleVersions.advisories.fixture.findings.push({ version: "1.1.0", dev: false, paths: ["root>another>test-package"] });
  assert.equal(normalizeNpmAudit(multipleVersions, 1).counts.high, 1);
});

test("npm network errors, partial JSON and inconsistent exit codes never become an empty PASS", () => {
  assert.throws(() => normalizeNpmAudit({ error: { message: sensitive } }, 1), /incomplete_npm_audit/);
  assert.throws(() => normalizeNpmAudit({ advisories: {} }, 0), /incomplete_npm_audit/);
  assert.throws(() => normalizeNpmAudit(npmReport(), 0), /npm_audit_exit_mismatch/);
  assert.throws(() => normalizeNpmAudit(npmReport(), 2), /npm_audit_exit_mismatch/);
  const raw = npmReport(); raw.advisories = {};
  assert.throws(() => normalizeNpmAudit(raw, 1), /npm_counts_mismatch/);
  assert.throws(() => parseJson(sensitive), (error) => error.code === "invalid_report_json" && !error.message.includes(sensitive));
});

test("Rust advisories retain categories and dependencies while stripping raw diagnostics", () => {
  const result = normalizeRustAudit(rustReport(), 1);
  assert.equal(result.status, "REVIEW-REQUIRED");
  assert.equal(result.findings[0].id, "RUSTSEC-2026-9999");
  assert.equal(result.findings[0].dependencies[0].package, "test-crate");
  assert.ok(!JSON.stringify(result).includes(sensitive));
  assert.equal(normalizeRustAudit(rustReport({ category: "yanked", errors: 0, severity: "warning" }), 0).status, "REVIEW-REQUIRED");
  const clean = JSON.stringify({ type: "summary", fields: { advisories: { errors: 0, warnings: 0 } } });
  assert.equal(normalizeRustAudit(clean, 0).status, "PASS");
});

test("Rust fetch failures and incomplete or inconsistent checks fail instead of being accepted as advisories", () => {
  assert.throws(() => normalizeRustAudit("", 1), /incomplete_rust_audit/);
  assert.throws(() => normalizeRustAudit(rustReport().split("\n")[0], 1), /incomplete_rust_audit/);
  assert.throws(() => normalizeRustAudit(rustReport({ errors: 0 }), 0), /rust_counts_mismatch/);
  assert.throws(() => normalizeRustAudit(rustReport(), 2), /rust_audit_exit_mismatch/);
  assert.throws(() => normalizeRustAudit(rustReport() + "\n" + JSON.stringify({ type: "log", fields: { level: "ERROR", message: sensitive } }), 1), /rust_audit_tool_error/);
  assert.throws(() => normalizeRustAudit(rustReport({ category: "unknown-error" }), 1), /unexpected_rust_diagnostic/);
});

test("missing executables and timeouts are explicit failures with no raw stderr leakage", () => {
  const spawn = () => ({ status: null, error: { code: "ENOENT", message: sensitive }, stderr: sensitive });
  assert.throws(() => execute("missing", [], { spawn }), (error) => error instanceof SecurityCheckError && error.environment && error.code === "tool_missing");
  assert.throws(() => execute("timeout", [], { spawn: () => ({ status: null, signal: "SIGTERM", stderr: sensitive }) }), /tool_execution_failed/);
});

test("missing scanner writes ENVIRONMENT-BLOCKED, not a stale PASS", () => {
  fixtureRepository(({ root }) => {
    const previous = process.env.GITLEAKS_BIN;
    try {
      process.env.GITLEAKS_BIN = path.join(root, "missing-scanner");
      const report = runSecurityCheck("secrets", root);
      assert.equal(report.status, "ENVIRONMENT-BLOCKED");
      assert.equal(report.error, "tool_missing");
      assert.equal(JSON.parse(readFileSync(path.join(root, "logs/security/secrets.json"), "utf8")).status, "ENVIRONMENT-BLOCKED");
    } finally {
      if (previous === undefined) delete process.env.GITLEAKS_BIN;
      else process.env.GITLEAKS_BIN = previous;
    }
  });
});

const integration = process.env.RUN_SECURITY_INTEGRATION === "1";
function fixtureRepository(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "nexaterm-security-test-"));
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "user.name=SecurityFixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${path.join(root, "no-hooks")}`, ...args], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, "临时 Git 仓库操作失败");
  };
  try {
    git("init", "-q");
    writeFileSync(path.join(root, "fixture.txt"), "safe fixture\n");
    git("add", "fixture.txt"); git("commit", "-qm", "Create synthetic fixture");
    callback({ root, git });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function syntheticSecret() {
  // 在运行时生成不属于任何服务的测试值，不向本仓库提交可用密钥。
  return `curl -H 'Authorization: ${"Bear" + "er"} fixture-${randomBytes(12).toString("hex")}' https://example.invalid\n`;
}

test("real Gitleaks detects a synthetic value committed then deleted from Git history", { skip: !integration }, () => {
  fixtureRepository(({ root, git }) => {
    const secret = syntheticSecret();
    writeFileSync(path.join(root, "removed.txt"), secret);
    git("add", "removed.txt"); git("commit", "-qm", "Add synthetic fixture");
    git("rm", "-q", "removed.txt"); git("commit", "-qm", "Remove synthetic fixture");
    const ciSummary = path.join(root, "ci-step-summary.md");
    writeFileSync(ciSummary, "existing CI summary\n");
    const env = { ...process.env, GITHUB_STEP_SUMMARY: ciSummary };
    // 故意触发的失败只属于测试夹具，不得写入真实 Actions 摘要。
    delete env.GITHUB_STEP_SUMMARY;
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL("./security-check.mjs", import.meta.url)), "secrets"],
      { cwd: root, encoding: "utf8", env });
    assert.equal(cli.status, 1, "命中必须让真实 CLI 非零退出");
    assert.equal(readFileSync(ciSummary, "utf8"), "existing CI summary\n", "测试失败不得污染 CI 摘要");
    assert.match(cli.stdout, /FAIL: secrets/);
    const report = JSON.parse(readFileSync(path.join(root, "logs/security/secrets.json"), "utf8"));
    assert.equal(report.error, undefined);
    assert.equal(report.status, "FAIL");
    assert.ok(report.findings.some((finding) => finding.file === "removed.txt" && finding.scope === "git"));
    const evidence = readFileSync(path.join(root, "logs/security/secrets.json"), "utf8");
    assert.ok(!evidence.includes(secret.trim()));
    assert.ok(!evidence.includes(secret.match(/fixture-[a-f0-9]+/)[0]));
  });
});

test("real Gitleaks scans dirty tracked content but does not read an untracked .env", { skip: !integration }, () => {
  fixtureRepository(({ root }) => {
    writeFileSync(path.join(root, ".env"), syntheticSecret());
    assert.equal(runSecurityCheck("secrets", root).status, "PASS");
    writeFileSync(path.join(root, "fixture.txt"), syntheticSecret());
    const report = runSecurityCheck("secrets", root);
    assert.equal(report.error, undefined);
    assert.equal(report.status, "FAIL");
    assert.ok(report.findings.some((finding) => finding.scope === "dir"));
  });
});

test("shallow checkout fails explicitly and overwrites a stale success report", { skip: !integration }, () => {
  fixtureRepository(({ root }) => {
    assert.equal(runSecurityCheck("secrets", root).status, "PASS");
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
    writeFileSync(path.join(root, ".git/shallow"), `${head}\n`);
    const report = runSecurityCheck("secrets", root);
    assert.equal(report.status, "FAIL");
    assert.equal(report.error, "shallow_history_not_allowed");
    assert.equal(JSON.parse(readFileSync(path.join(root, "logs/security/secrets.json"), "utf8")).status, "FAIL");
  });
});
