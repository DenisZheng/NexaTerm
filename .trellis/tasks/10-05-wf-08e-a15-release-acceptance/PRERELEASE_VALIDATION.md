# 无平台证书预发布通道验证

## 已执行

- `node --test scripts/release-policy.test.mjs scripts/release-signing-source.test.mjs scripts/build-platform.test.mjs scripts/release-assets.test.mjs scripts/generate-latest-json.test.mjs scripts/a15-evidence-check.test.mjs`：29/29 PASS。
- `node scripts/check-wf08a-release-migration-source.mjs`、`node scripts/check-wf08c-release-surface.mjs`、`node scripts/check-wf08e-a15-release-source.mjs`：全部 PASS。
- `node scripts/check-line-budget.mjs`、`node --check scripts/release-policy.mjs`、`git diff --check`：PASS。
- Ruby YAML 解析，并检查 policy → build → prepare → publish 依赖、policy 输出字段与 publish 条件：PASS。没有安装额外依赖；本机无 actionlint，未声称完成 actionlint 检查。
- `cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --locked --offline --format-version 1`：成功，根包版本 0.1.17-rc.1。package.json / tauri.conf.json / Cargo.toml / Cargo.lock 已对齐。

## 回归边界

正式 tag 仍需 Windows Authenticode 和 macOS Developer ID/公证；预发布 tag 只能创建非 latest 草稿。所有发布构建保留 updater 密钥要求及已有非空 .sig 检查，SHA256、许可证不变。非法/不一致版本在 policy job 拒绝；手动分支构建不发布 Release。

本次没有修改 TS/Rust 运行时逻辑，未重复完整应用编译；真实跨平台打包将由候选 Release workflow 验证。源码测试和 YAML 解析不等于 GitHub Actions 已执行或安装包已可用。

## 待执行

- 人工审核后提交工作流/版本/文档，推送独立分支、创建 PR，并在该分支手动构建测试 artifact。
- 记录构建实际 SHA、run、各平台产物及 SHA256；维护者验证 Windows/macOS 安装和基本功能。
- 后续 v0.1.17-rc.1 tag 对应的草稿产物须与验收候选一致或补验；补充草稿验收说明后再公开，不把 A15 写成 PASS。
