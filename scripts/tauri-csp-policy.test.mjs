import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareWithTauriConf,
  readCspPolicy,
  readTauriSecurity,
  renderCsp,
  validateCspPolicy,
} from "./tauri-csp-policy.mjs";

const currentPolicy = readCspPolicy();

function clonePolicy() {
  return structuredClone(currentPolicy);
}

test("current CSP policy draft validates with real call sites", () => {
  assert.deepEqual(validateCspPolicy(currentPolicy), []);
});

test("current tauri.conf.json is either unset (REVIEW-REQUIRED) or matches the draft", () => {
  const result = compareWithTauriConf(currentPolicy, readTauriSecurity());
  assert.notEqual(result.status, "FAIL", result.messages.join("\n"));
});

test("rejects wildcard and unsafe-eval regardless of evidence", () => {
  const policy = clonePolicy();
  policy.production["script-src"].push("*");
  policy.production["script-src"].push("'unsafe-eval'");
  const errors = validateCspPolicy(policy).join("\n");
  assert.match(errors, /production script-src must not allow \*/);
  assert.match(errors, /production script-src must not allow 'unsafe-eval'/);
});

test("rejects a relaxation without a relaxation entry", () => {
  const policy = clonePolicy();
  policy.production["script-src"].push("'unsafe-inline'");
  assert.match(
    validateCspPolicy(policy).join("\n"),
    /production script-src 'unsafe-inline' has no relaxation entry/,
  );
});

test("dev reuses production evidence but dev-only relaxations still need their own", () => {
  const policy = clonePolicy();
  // dev style-src 'unsafe-inline' 只有 production 证据，应被接受。
  assert.deepEqual(validateCspPolicy(policy), []);
  // production 没有 blob:，dev 单独加就必须自带证据。
  policy.dev["worker-src"].push("blob:");
  assert.match(
    validateCspPolicy(policy).join("\n"),
    /dev worker-src blob: has no relaxation entry/,
  );
});

test("rejects a relaxation whose call site does not exist", () => {
  const policy = clonePolicy();
  policy.relaxations[0].callSites = ["src/does-not-exist.tsx"];
  assert.match(
    validateCspPolicy(policy, () => false).join("\n"),
    /call site does not exist: src\/does-not-exist\.tsx/,
  );
});

test("rejects stale evidence for a source no longer in the profile", () => {
  const policy = clonePolicy();
  policy.production["img-src"] = policy.production["img-src"].filter((s) => s !== "data:");
  assert.match(
    validateCspPolicy(policy).join("\n"),
    /relaxation production img-src data: is not present in that profile/,
  );
});

test("rejects object-src other than 'none' and missing required directives", () => {
  const policy = clonePolicy();
  policy.production["object-src"] = ["'self'"];
  delete policy.dev["connect-src"];
  const errors = validateCspPolicy(policy).join("\n");
  assert.match(errors, /production object-src must be 'none'/);
  assert.match(errors, /dev must define connect-src/);
});

test("compare reports REVIEW-REQUIRED while csp is null, PASS when enabled, FAIL when drifted", () => {
  const unset = compareWithTauriConf(currentPolicy, { csp: null, devCsp: null });
  assert.equal(unset.status, "REVIEW-REQUIRED");

  const enabled = compareWithTauriConf(currentPolicy, {
    csp: renderCsp(currentPolicy.production),
    devCsp: renderCsp(currentPolicy.dev),
  });
  assert.equal(enabled.status, "PASS");

  const drifted = compareWithTauriConf(currentPolicy, {
    csp: "default-src *",
    devCsp: renderCsp(currentPolicy.dev),
  });
  assert.equal(drifted.status, "FAIL");
  assert.match(drifted.messages.join("\n"), /csp differs from csp-policy\.json/);
});

test("compare accepts Tauri object-form csp equivalent to the rendered string", () => {
  const objectForm = Object.fromEntries(
    Object.entries(currentPolicy.production)
      .filter(([key]) => !key.startsWith("$"))
      .map(([directive, sources]) => [directive, sources.join(" ")]),
  );
  const result = compareWithTauriConf(currentPolicy, {
    csp: objectForm,
    devCsp: renderCsp(currentPolicy.dev),
  });
  assert.equal(result.status, "PASS", result.messages.join("\n"));
});
