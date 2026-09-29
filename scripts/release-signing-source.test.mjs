import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("tagged releases fail closed on Windows Authenticode signing", () => {
  const workflow = read(".github/workflows/release.yml");
  const build = read("scripts/build-platform.mjs");

  assert.match(
    workflow,
    /startsWith\(github\.ref, 'refs\/tags\/v'\) && matrix\.target == 'windows-x64'/,
  );
  assert.match(workflow, /secrets\.WINDOWS_CERTIFICATE/);
  assert.match(workflow, /secrets\.WINDOWS_CERTIFICATE_PASSWORD/);
  assert.match(workflow, /Import-PfxCertificate/);
  assert.match(workflow, /NEXATERM_WINDOWS_CERTIFICATE_THUMBPRINT/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /signature\.Status -ne "Valid"/);

  assert.match(build, /certificateThumbprint/);
  assert.match(build, /digestAlgorithm: "sha256"/);
  assert.match(build, /timestampUrl/);
});

test("tagged macOS releases require Developer ID signing and notarization evidence", () => {
  const workflow = read(".github/workflows/release.yml");

  for (const name of [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_TEAM_ID",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`));
  }

  assert.match(workflow, /Developer ID Application/);
  assert.match(workflow, /APPLE_SIGNING_IDENTITY/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /spctl --assess --type execute/);
  assert.match(workflow, /xcrun stapler validate/);
});

test("release workflow no longer contains unsigned OS-signing extension points", () => {
  const workflow = read(".github/workflows/release.yml");

  assert.doesNotMatch(workflow, /Windows code signing extension point/);
  assert.doesNotMatch(workflow, /macOS signing and notarization extension point/);
  assert.doesNotMatch(workflow, /intentionally not configured yet/);
});

test("updater identity remains pinned to the NexaTerm release endpoint and public key", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const updater = config.plugins?.updater;

  assert.ok(typeof updater?.pubkey === "string" && updater.pubkey.trim().length > 0);
  assert.deepEqual(updater?.endpoints, [
    "https://github.com/DenisZheng/NexaTerm/releases/latest/download/latest.json",
  ]);
});
