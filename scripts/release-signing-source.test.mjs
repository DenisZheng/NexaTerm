import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("stable tagged releases fail closed on Windows Authenticode signing", () => {
  const workflow = read(".github/workflows/release.yml");
  const build = read("scripts/build-platform.mjs");

  assert.match(
    workflow,
    /needs\.policy\.outputs\.platformSigning == 'true' && matrix\.target == 'windows-x64'/,
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

test("stable tagged macOS releases require Developer ID signing and notarization evidence", () => {
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


test("发布工作流复用通道判定并保留 updater 签名硬门禁", () => {
  const workflow = read(".github/workflows/release.yml");
  assert.match(workflow, /run: node scripts\/release-policy\.mjs/);
  assert.match(workflow, /needs: \[policy, prepare\]/);
  assert.match(workflow, /if: needs\.policy\.outputs\.publish == 'true'/);
  for (const platform of ["windows-x64", "macos-arm64"]) {
    const condition = `needs.policy.outputs.platformSigning == 'true' && matrix.target == '${platform}'`;
    assert.equal(workflow.split(condition).length - 1, 2, `${platform} 导入与校验必须同一条件`);
  }
  assert.match(workflow, /draft: \$\{\{ needs\.policy\.outputs\.draft == 'true' \}\}/);
  assert.match(workflow, /prerelease: \$\{\{ needs\.policy\.outputs\.prerelease == 'true' \}\}/);
  assert.match(workflow, /make_latest: \$\{\{ needs\.policy\.outputs\.makeLatest \}\}/);
  assert.match(workflow, /docs\/PRERELEASE_NOTES\.md/);
  const updaterStep = workflow.split("- name: Validate and normalize updater signing secret")[1].split("- name:")[0];
  assert.doesNotMatch(updaterStep, /\n\s+if:/);
  assert.match(updaterStep, /node scripts\/prepare-tauri-signing-key\.mjs/);
  const signingKeyPrep = read("scripts/prepare-tauri-signing-key.mjs");
  assert.match(signingKeyPrep, /Missing TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(signingKeyPrep, /process\.exitCode = 1/);
  assert.match(workflow, /NEXATERM_CREATE_UPDATER_ARTIFACTS: "1"/);
  assert.match(workflow, /generate-latest-json\.mjs/);
});
