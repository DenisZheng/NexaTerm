import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("pnpm lockfile is the only JavaScript release lock source", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.packageManager, "pnpm@11.22.0");
  assert.equal(existsSync("pnpm-lock.yaml"), true);
  assert.equal(existsSync("package-lock.json"), false);
  assert.equal(existsSync("yarn.lock"), false);
});

test("Tauri bundles project and third-party notices", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.ok(config.bundle.resources.includes("../LICENSE"));
  assert.ok(config.bundle.resources.includes("../THIRD_PARTY_LICENSES.md"));
});

test("release pipeline gates licenses and publishes generated evidence", () => {
  const workflow = read(".github/workflows/release.yml");
  assert.match(workflow, /pnpm run check:licenses/);
  assert.match(workflow, /THIRD_PARTY_LICENSES\.generated\.md/);
  assert.match(workflow, /license-inventory\.json/);
  assert.match(workflow, /cp LICENSE THIRD_PARTY_LICENSES\.md/);
});

test("copyleft reviews are package-specific and notices cover installer runtimes", () => {
  const policy = JSON.parse(read("scripts/license-policy.json"));
  const notice = read("THIRD_PARTY_LICENSES.md");
  const components = JSON.parse(read("docs/legal/bundled-components.json"));

  assert.deepEqual(policy.manualReviews["npm:@novnc/novnc"].allowedLicenses, ["MPL-2.0"]);
  assert.deepEqual(policy.manualReviews["cargo:serialport"].allowedLicenses, ["MPL-2.0"]);
  for (const marker of ["noVNC", "serialport-rs", "SQLite", "NSIS", "AppImageKit"]) {
    assert.match(notice, new RegExp(marker));
  }
  for (const component of ["NSIS installer runtime/tooling", "AppImageKit runtime"]) {
    assert.ok(components.components.some((item) => item.name === component));
  }
});
