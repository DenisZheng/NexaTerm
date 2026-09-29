import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateInventory,
  normalizeLicense,
  renderMarkdown,
} from "./license-inventory.mjs";

const policy = {
  blockedLicenseFragments: ["AGPL-", "GPL-3.0", "SSPL-"],
  manualReviewLicenseFragments: ["MPL-", "LGPL-"],
  manualReviews: {
    "npm:@novnc/novnc": {
      allowedLicenses: ["MPL-2.0"],
      distribution: "reviewed MPL dependency",
    },
  },
};

test("normalizes common package license metadata forms", () => {
  assert.equal(normalizeLicense(" MIT "), "MIT");
  assert.equal(normalizeLicense({ type: "Apache-2.0" }), "Apache-2.0");
  assert.equal(
    normalizeLicense([{ type: "MIT" }, { type: "Apache-2.0" }]),
    "MIT OR Apache-2.0",
  );
  assert.equal(normalizeLicense(undefined, "LICENSE.txt"), "LicenseRef-File:LICENSE.txt");
});

test("license policy blocks missing/strong-copyleft and requires explicit MPL review", () => {
  const packages = [
    { ecosystem: "npm", name: "ok", version: "1", license: "MIT" },
    { ecosystem: "npm", name: "missing", version: "1", license: "" },
    { ecosystem: "cargo", name: "bad", version: "1", license: "GPL-3.0-only" },
    { ecosystem: "cargo", name: "needs-review", version: "1", license: "MPL-2.0" },
    { ecosystem: "cargo", name: "license-file-only", version: "1", license: "LicenseRef-File:LICENSE" },
    { ecosystem: "npm", name: "@novnc/novnc", version: "1.7.0", license: "MPL-2.0" },
  ];

  const issues = evaluateInventory(packages, policy);
  assert.deepEqual(
    issues.map((issue) => issue.type),
    ["missing-license", "blocked-license", "manual-review-required", "unknown-license"],
  );
});

test("SPDX OR chooses an acceptable branch while AND remains strict", () => {
  const packages = [
    { ecosystem: "cargo", name: "mit-or-gpl", version: "1", license: "MIT OR GPL-3.0-only" },
    { ecosystem: "npm", name: "mpl-or-apache", version: "1", license: "(MPL-2.0 OR Apache-2.0)" },
    { ecosystem: "cargo", name: "lgpl-option", version: "1", license: "MIT OR Apache-2.0 OR LGPL-2.1-or-later" },
    { ecosystem: "cargo", name: "mit-and-gpl", version: "1", license: "MIT AND GPL-3.0-only" },
  ];

  const issues = evaluateInventory(packages, policy);
  assert.deepEqual(
    issues.map((issue) => [issue.key, issue.type]),
    [["cargo:mit-and-gpl", "blocked-license"]],
  );
});

test("manual review fails closed when the package license changes", () => {
  const issues = evaluateInventory(
    [{ ecosystem: "npm", name: "@novnc/novnc", version: "2", license: "LGPL-3.0-only" }],
    policy,
  );
  assert.equal(issues[0]?.type, "review-license-changed");
});

test("generated markdown contains exact package versions and policy result", () => {
  const packages = [
    { ecosystem: "npm", name: "react", version: "19.3.0", license: "MIT" },
  ];
  const markdown = renderMarkdown(packages, policy, []);
  assert.match(markdown, /react/);
  assert.match(markdown, /19\.3\.0/);
  assert.match(markdown, /No policy violations detected/);
});
