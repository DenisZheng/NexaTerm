#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_POLICY = "scripts/license-policy.json";
const DEFAULT_OUT_DIR = "logs/licenses";

export function normalizeLicense(value, licenseFile) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type.trim();
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeLicense(item))
      .filter(Boolean);
    if (parts.length) return parts.join(" OR ");
  }
  if (typeof licenseFile === "string" && licenseFile.trim()) {
    return `LicenseRef-File:${licenseFile.trim()}`;
  }
  return "";
}

async function packageManifestPaths(storeRoot) {
  const result = [];
  const entries = await readdir(storeRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const modulesDir = path.join(storeRoot, entry.name, "node_modules");
    let children;
    try {
      children = await readdir(modulesDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (child.name.startsWith("@")) {
        let scoped;
        try {
          scoped = await readdir(path.join(modulesDir, child.name), { withFileTypes: true });
        } catch {
          continue;
        }
        for (const packageDir of scoped) {
          if (packageDir.isDirectory()) {
            result.push(path.join(modulesDir, child.name, packageDir.name, "package.json"));
          }
        }
      } else {
        result.push(path.join(modulesDir, child.name, "package.json"));
      }
    }
  }
  return result;
}

export async function collectNpmInventory(storeRoot = "node_modules/.pnpm") {
  const inventory = new Map();
  for (const manifestPath of await packageManifestPaths(storeRoot)) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (!manifest?.name || !manifest?.version) continue;
    const license = normalizeLicense(manifest.license ?? manifest.licenses, manifest.licenseFile);
    const repository =
      typeof manifest.repository === "string"
        ? manifest.repository
        : manifest.repository?.url || manifest.homepage || null;
    const record = {
      ecosystem: "npm",
      name: manifest.name,
      version: String(manifest.version),
      license,
      source: repository,
    };
    inventory.set(`${record.name}@${record.version}`, record);
  }
  return [...inventory.values()].sort(comparePackages);
}

export function collectCargoInventory(manifestPath = "src-tauri/Cargo.toml") {
  const result = spawnSync(
    "cargo",
    ["metadata", "--locked", "--format-version", "1", "--manifest-path", manifestPath],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `cargo metadata failed: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  const metadata = JSON.parse(result.stdout);
  const workspaceIds = new Set(metadata.workspace_members || []);
  return (metadata.packages || [])
    .filter((pkg) => !workspaceIds.has(pkg.id))
    .map((pkg) => ({
      ecosystem: "cargo",
      name: pkg.name,
      version: String(pkg.version),
      license: normalizeLicense(pkg.license, pkg.license_file),
      source: pkg.repository || pkg.source || null,
    }))
    .sort(comparePackages);
}

function comparePackages(left, right) {
  return (
    left.ecosystem.localeCompare(right.ecosystem) ||
    left.name.localeCompare(right.name) ||
    left.version.localeCompare(right.version)
  );
}

function hasFragment(license, fragments) {
  const normalized = license.toUpperCase();
  return fragments.find((fragment) => normalized.includes(fragment.toUpperCase())) || null;
}

export function evaluateInventory(packages, policy) {
  const issues = [];
  for (const pkg of packages) {
    const key = `${pkg.ecosystem}:${pkg.name}`;
    const review = policy.manualReviews?.[key] || null;
    const license = pkg.license?.trim() || "";

    if (!license) {
      issues.push({ key, type: "missing-license", license: "", version: pkg.version });
      continue;
    }
    if (/\b(UNKNOWN|UNLICENSED)\b/i.test(license) || /^SEE LICENSE/i.test(license)) {
      if (!review) {
        issues.push({ key, type: "unknown-license", license, version: pkg.version });
        continue;
      }
    }

    const blocked = hasFragment(license, policy.blockedLicenseFragments || []);
    if (blocked) {
      issues.push({
        key,
        type: "blocked-license",
        fragment: blocked,
        license,
        version: pkg.version,
      });
      continue;
    }

    const manualFragment = hasFragment(
      license,
      policy.manualReviewLicenseFragments || [],
    );
    if (manualFragment && !review) {
      issues.push({
        key,
        type: "manual-review-required",
        fragment: manualFragment,
        license,
        version: pkg.version,
      });
      continue;
    }

    if (
      review?.allowedLicenses?.length &&
      !review.allowedLicenses.includes(license)
    ) {
      issues.push({
        key,
        type: "review-license-changed",
        license,
        expected: review.allowedLicenses,
        version: pkg.version,
      });
    }
  }
  return issues;
}

export function renderMarkdown(packages, policy, issues) {
  const rows = packages
    .map((pkg) => {
      const review = policy.manualReviews?.[`${pkg.ecosystem}:${pkg.name}`];
      const note = review?.distribution || "";
      return `| ${escapeCell(pkg.ecosystem)} | ${escapeCell(pkg.name)} | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license || "MISSING")} | ${escapeCell(note)} |`;
    })
    .join("\n");
  const issueText =
    issues.length === 0
      ? "No policy violations detected."
      : issues
          .map(
            (issue) =>
              `- **${issue.type}**: ${issue.key}@${issue.version} — ${issue.license || "no license metadata"}`,
          )
          .join("\n");
  return `# Generated third-party license inventory

This file is generated from the installed pnpm dependency store and \`cargo metadata --locked\`.
It is evidence for the exact dependency graph used by CI/release; the curated distribution notice is \`THIRD_PARTY_LICENSES.md\`.

## Summary

- Packages: ${packages.length}
- Policy issues: ${issues.length}

## Policy result

${issueText}

## Packages

| Ecosystem | Package | Version | License | Manual distribution note |
| --- | --- | --- | --- | --- |
${rows}
`;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function parseArgs(argv) {
  const options = { check: false, outDir: DEFAULT_OUT_DIR, policy: DEFAULT_POLICY };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      options.check = true;
      continue;
    }
    if (token === "--out-dir" || token === "--policy") {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${token}`);
      options[token === "--out-dir" ? "outDir" : "policy"] = value;
      continue;
    }
    throw new Error(`Unsupported option: ${token}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const policy = JSON.parse(await readFile(options.policy, "utf8"));
  const npm = await collectNpmInventory();
  const cargo = collectCargoInventory();
  const packages = [...npm, ...cargo].sort(comparePackages);
  const issues = evaluateInventory(packages, policy);

  await mkdir(options.outDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    policy_version: policy.version,
    package_count: packages.length,
    issue_count: issues.length,
    packages,
    issues,
  };
  await writeFile(
    path.join(options.outDir, "license-inventory.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile(
    path.join(options.outDir, "THIRD_PARTY_LICENSES.generated.md"),
    renderMarkdown(packages, policy, issues),
  );

  console.log(
    `License inventory: ${npm.length} npm + ${cargo.length} Cargo packages; ${issues.length} policy issue(s).`,
  );
  for (const issue of issues) {
    console.error(
      `[${issue.type}] ${issue.key}@${issue.version}: ${issue.license || "missing license metadata"}`,
    );
  }
  if (options.check && issues.length > 0) process.exitCode = 1;
}

function isExecutedAsCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isExecutedAsCli()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
