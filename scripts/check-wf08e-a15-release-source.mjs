#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { evaluateA15Evidence } from "./a15-evidence-check.mjs";

const validator = readFileSync(new URL("./a15-evidence-check.mjs", import.meta.url), "utf8");
const template = JSON.parse(readFileSync(new URL("../.trellis/tasks/10-05-wf-08e-a15-release-acceptance/A15_EVIDENCE_TEMPLATE.json", import.meta.url), "utf8"));
const currentEvidence = JSON.parse(readFileSync(new URL("../.trellis/tasks/10-05-wf-08e-a15-release-acceptance/A15_EVIDENCE_CURRENT.json", import.meta.url), "utf8"));
const release = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const perf = readFileSync(new URL("../tests/performance/wf08d-workload.json", import.meta.url), "utf8");
const acceptance = readFileSync(new URL("../.trellis/tasks/09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md", import.meta.url), "utf8");

function fail(message) {
  throw new Error(`WF-08E A15 release acceptance: ${message}`);
}
function requireAll(source, needles, label) {
  for (const needle of needles) {
    if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
  }
}

if (template.schemaVersion !== 1) fail("evidence template schemaVersion must be 1");
for (const platform of ["windows-x64","macos-arm64","linux-x64"]) {
  if (!template.platforms?.[platform]) fail(`template missing platform: ${platform}`);
}
for (const predecessor of ["A09","A10"]) {
  if (template.predecessor?.[predecessor] !== "pending") {
    fail(`${predecessor} must remain pending in the neutral template; real results belong in current evidence`);
  }
}
if (template.signoff?.status !== "pending") {
  fail("template must never pre-approve A15 signoff");
}

requireAll(validator, [
  '"A09 MultiExec live fixed-target real Tauri"',
  '"A10 MultiExec disconnect/reconnect real Tauri"',
  '"Windows Authenticode"',
  '"macOS Developer ID"',
  '"macOS notarization/staple"',
  '"mXterm core App Data migration"',
  '"10 SSH + Split/SFTP/Transfer/Monitoring"',
  '"signed updater metadata"',
  'validSignoff: eligible && declared === "pass"',
], "evidence validator");

requireAll(release, [
  "windows-x64",
  "macos-arm64",
  "linux-x64",
  "Verify Windows Authenticode signatures",
  "Verify macOS Developer ID signature and notarization",
  "generate-latest-json.mjs",
  "SHA256SUMS.txt",
], "release workflow");

for (const needle of [
  '"sshSessions": 10',
  '"cycles": 3',
  '"idleMemoryReviewRatio": 1.25',
]) {
  if (!perf.includes(needle)) fail(`WF-08D workload missing final A15 requirement: ${needle}`);
}

if (!acceptance.includes("| A09 |") || !acceptance.includes("| A10 |")) {
  fail("canonical acceptance report must retain A09/A10 rows");
}
for (const predecessor of ["A09","A10"]) {
  if (currentEvidence.predecessor?.[predecessor] !== "pass") {
    fail(`current A15 evidence must record maintainer-confirmed ${predecessor}=pass`);
  }
}
if (currentEvidence.signoff?.status !== "pending") {
  fail("current A15 signoff must remain pending until all real release blockers clear");
}

const currentResult = evaluateA15Evidence(currentEvidence);
if (currentResult.eligible || currentResult.validSignoff) {
  fail("current A15 evidence must still have real release blockers before final signoff");
}
for (const cleared of ["A09 MultiExec live fixed-target real Tauri", "A10 MultiExec disconnect/reconnect real Tauri"]) {
  if (currentResult.blockers.some((item) => item.label === cleared)) {
    fail(`cleared predecessor unexpectedly remains an A15 blocker: ${cleared}`);
  }
}
if (!acceptance.includes("A09 / A10（2026-10-05 真实 Tauri 通过）")) {
  fail("canonical acceptance report must record the 2026-10-05 A09/A10 real-Tauri PASS");
}

console.log("PASS  WF-08E final A15 evidence contract");
