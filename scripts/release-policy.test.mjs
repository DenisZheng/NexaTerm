import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { releasePolicy } from "./release-policy.mjs";

function input(version, ref = `refs/tags/v${version}`, eventName = "push") {
  return { ref, eventName, versions: { package: version, tauri: version, cargo: version } };
}

test("正式 tag 保留平台签名并发布正式版本", () => {
  assert.deepEqual(releasePolicy(input("0.1.17")), {
    version: "0.1.17", tag: "v0.1.17", publish: true, prerelease: false,
    platformSigning: true, draft: false, makeLatest: "legacy",
  });
});

for (const channel of ["alpha", "beta", "rc"]) {
  test(`${channel} tag 只能生成非 latest 的无平台签名预发布草稿`, () => {
    const policy = releasePolicy(input(`0.1.17-${channel}.1`));
    assert.equal(policy.publish, true);
    assert.equal(policy.platformSigning, false);
    assert.equal(policy.prerelease, true);
    assert.equal(policy.draft, true);
    assert.equal(policy.makeLatest, "false");
  });
}

test("手动分支构建永不创建 Release；在正式 tag 重跑仍需证书", () => {
  for (const version of ["0.1.17", "0.1.17-rc.1"]) {
    const policy = releasePolicy(input(version, "refs/heads/main", "workflow_dispatch"));
    assert.equal(policy.publish, false);
    assert.equal(policy.platformSigning, false);
    assert.equal(policy.makeLatest, "false");
  }
  assert.equal(releasePolicy(input("0.1.17", "refs/tags/v0.1.17", "workflow_dispatch")).platformSigning, true);
});

test("非法版本和 tag、清单不一致、非发布事件均拒绝", () => {
  for (const version of ["0.1.17-preview.1", "0.1.17-rc", "0.1.17-rc.01", "01.1.17", "0.1.17+meta", "0.1.17\n"]) {
    assert.throws(() => releasePolicy(input(version)), /Unsupported release version/);
  }
  for (const ref of ["refs/tags/v0.1.18", "refs/tags/v0.1.17-rc.1", "refs/tags/0.1.17", "refs/heads/main"]) {
    assert.throws(() => releasePolicy(input("0.1.17", ref)));
  }
  for (const key of ["tauri", "cargo"]) {
    const args = input("0.1.17-rc.1"); args.versions[key] = "0.1.17";
    assert.throws(() => releasePolicy(args), /version does not match/);
  }
  assert.throws(() => releasePolicy(input("0.1.17", "refs/tags/v0.1.17", "pull_request")));
});

test("CLI 读取真实清单格式，输出 GitHub 通道字段；失败不输出发布授权", () => {
  const dir = mkdtempSync(join(tmpdir(), "nexaterm-policy-"));
  try {
    mkdirSync(join(dir, "src-tauri"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.1.17-rc.1" }));
    writeFileSync(join(dir, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.1.17-rc.1" }));
    writeFileSync(join(dir, "src-tauri/Cargo.toml"), '[package]\nname = "nexaterm"\nversion = "0.1.17-rc.1"\n\n[lib]\n');
    const output = join(dir, "output");
    const run = (ref) => spawnSync(process.execPath, [fileURLToPath(new URL("./release-policy.mjs", import.meta.url))], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, GITHUB_REF: ref, GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: output },
    });
    const ok = run("refs/tags/v0.1.17-rc.1");
    assert.equal(ok.status, 0, ok.stderr);
    const fields = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=")));
    assert.equal(fields.publish, "true");
    assert.equal(fields.platformSigning, "false");
    assert.equal(fields.draft, "true");
    assert.equal(fields.prerelease, "true");
    assert.equal(fields.makeLatest, "false");
    writeFileSync(output, "");
    const bad = run("refs/tags/v0.1.17");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Tag does not match/);
    assert.equal(readFileSync(output, "utf8"), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
