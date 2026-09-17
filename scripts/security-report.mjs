import { createHash } from "node:crypto";

export class SecurityCheckError extends Error {
  constructor(code, environment = false) {
    super(code);
    this.code = code;
    this.environment = environment;
  }
}

export function requireCheck(condition, code) {
  if (!condition) throw new SecurityCheckError(code);
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // JSON 解析器的原始错误可能回显命中内容，不得传到日志。
    throw new SecurityCheckError("invalid_report_json");
  }
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function text(value) {
  requireCheck(typeof value === "string", "invalid_report_field");
  return value;
}

export function sourceHash(value) {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");
}

export function normalizeSecrets(raw, exitCode) {
  requireCheck(Array.isArray(raw), "invalid_secret_report");
  requireCheck(exitCode === (raw.length ? 10 : 0), "secret_scan_exit_mismatch");
  return raw.map((item) => {
    requireCheck(object(item) && count(item.StartLine) && item.StartLine > 0 &&
      count(item.EndLine) && item.EndLine >= item.StartLine, "invalid_secret_location");
    const commit = item.Commit || "";
    requireCheck(/^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/.test(commit), "invalid_secret_commit");
    // 仅投影定位信息；不保留 Match / Secret / 作者 / 提交说明。
    return { rule: text(item.RuleID), file: text(item.File).replaceAll("\\", "/"),
      startLine: item.StartLine, endLine: item.EndLine, commit };
  });
}

export function isReviewedFixture(finding, source, fixtures) {
  const excerpt = source.replaceAll("\r\n", "\n").split("\n")
    .slice(finding.startLine - 1, finding.endLine).join("\n");
  return fixtures.some((fixture) => fixture.rule === finding.rule &&
    fixture.file === finding.file && fixture.sourceSha256 === sourceHash(excerpt) &&
    typeof fixture.reason === "string" && fixture.reason.length > 0);
}

export function normalizeNpmAudit(raw, exitCode) {
  requireCheck(object(raw) && !raw.error && object(raw.advisories) &&
    object(raw.metadata?.vulnerabilities), "incomplete_npm_audit");
  const severities = ["info", "low", "moderate", "high", "critical"];
  const counts = Object.fromEntries(severities.map((severity) => {
    requireCheck(count(raw.metadata.vulnerabilities[severity]), "invalid_npm_counts");
    return [severity, raw.metadata.vulnerabilities[severity]];
  }));
  const findings = Object.values(raw.advisories).map((item) => {
    requireCheck(object(item) && count(item.id) && severities.includes(item.severity) &&
      (item.github_advisory_id === "" || /^GHSA-[a-z0-9-]+$/.test(item.github_advisory_id)) &&
      Array.isArray(item.findings) && item.findings.length > 0, "invalid_npm_advisory");
    return {
      id: item.github_advisory_id || null, registryId: item.id,
      package: text(item.module_name), severity: item.severity,
      vulnerableVersions: text(item.vulnerable_versions),
      // pnpm 不能总从影响范围推断修复范围；缺失表示未知，不是报告失败或已修复。
      patchedVersions: item.patched_versions === undefined ? null : text(item.patched_versions),
      dependencies: item.findings.map((finding) => {
        requireCheck(Array.isArray(finding.paths) && typeof finding.dev === "boolean", "invalid_npm_dependency");
        return { version: text(finding.version), dev: finding.dev, paths: finding.paths.map(text) };
      }),
    };
  });
  // pnpm 的 bulk audit 按 advisory 计数，而非按受影响版本或依赖路径计数。
  requireCheck(severities.every((severity) => counts[severity] ===
    findings.filter((finding) => finding.severity === severity).length), "npm_counts_mismatch");
  requireCheck(exitCode === (findings.length ? 1 : 0), "npm_audit_exit_mismatch");
  return { status: findings.length ? "REVIEW-REQUIRED" : "PASS", counts, findings };
}

function crateGraph(graph) {
  requireCheck(object(graph?.Krate), "invalid_rust_dependency_graph");
  return { package: text(graph.Krate.name), version: text(graph.Krate.version),
    parents: (graph.parents ?? []).map(crateGraph) };
}

export function normalizeRustAudit(output, exitCode) {
  const rows = output.split(/\r?\n/).filter((line) => line.trim()).map(parseJson);
  const summaries = rows.filter((row) => row.type === "summary");
  requireCheck(summaries.length === 1, "incomplete_rust_audit");
  const stats = summaries[0].fields?.advisories;
  requireCheck(object(stats) && count(stats.errors) && count(stats.warnings), "invalid_rust_counts");
  requireCheck(!rows.some((row) => row.type === "log" && row.fields?.level === "ERROR"), "rust_audit_tool_error");
  const diagnostics = rows.filter((row) => row.type === "diagnostic").map((row) => row.fields);
  const findings = diagnostics.map((item) => {
    requireCheck(object(item) && ["vulnerability", "unmaintained", "unsound", "notice", "yanked"].includes(item.code),
      "unexpected_rust_diagnostic");
    requireCheck(Array.isArray(item.graphs) && item.graphs.length > 0, "missing_rust_dependency_graph");
    if (item.code !== "yanked") {
      requireCheck(/^RUSTSEC-\d{4}-\d{4}$/.test(item.advisory?.id), "invalid_rust_advisory");
    }
    return { id: item.advisory?.id ?? null, category: item.code,
      cvss: item.advisory?.cvss ?? null, dependencies: item.graphs.map(crateGraph) };
  });
  requireCheck(stats.errors === diagnostics.filter((item) => item.severity === "error").length &&
    stats.warnings === diagnostics.filter((item) => item.severity === "warning").length, "rust_counts_mismatch");
  requireCheck(exitCode === (stats.errors ? 1 : 0), "rust_audit_exit_mismatch");
  return { status: findings.length ? "REVIEW-REQUIRED" : "PASS", counts: { errors: stats.errors, warnings: stats.warnings }, findings };
}
