# 精简 Windows portable ZIP：显式 allowlist 与 bsdtar 标准 zip

## 用户流程

维护者从 GitHub Release 下载 `NexaTerm-portable-windows-x64.zip`，解压后只看到运行所需文件（主程序、两个 MCP sidecar、Tauri 资源目录、许可证、portable 标记），不再混入 pdb / .d / .fingerprint / nsis 等构建残留。

## 范围与已确认事实

- 2026-10-11 对 `v0.1.17-rc.1` 的验收发现：portable ZIP 共 2707 条目、解压约 79 MB，其中约 21 MB 为构建残留（`nexaterm.pdb` 15 MB、`mxterm_mcp.pdb` 6 MB、`.d`、`.fingerprint/` 2688 项、`nsis/` staging、`.cargo-*.lock`），且 Compress-Archive 生成的条目使用反斜杠分隔符。
- 根因：`release.yml` "Collect release assets" 步骤用 `find ... ! -name` 排除法整目录复制 `src-tauri/target/release`。
- 维护者 2026-10-11 选定方案：在 `release.yml` 内改为显式 allowlist，用 Windows 自带 bsdtar 生成标准 zip，并在 `check-wf08c-release-surface` 加断言锁定。
- 纯发布脚本任务，不改产品交互，WS 规则不适用；关联验收编号 A15（WF-08C / WF-08E 发布面）。

## 要求

- allowlist 固定为 `nexaterm.exe`、`nexaterm-mcp.exe`、`mxterm-mcp.exe`、`_up_/`、`LICENSE`、`THIRD_PARTY_LICENSES.md`、`portable.marker`；任一缺失即构建失败，不得静默跳过。
- zip 由 `%SystemRoot%\System32\tar.exe`（bsdtar）生成，条目使用正斜杠；不再使用 Compress-Archive，不再整目录复制 `target/release`。
- 保留 `NexaTerm-portable` 命名以及 SHA256SUMS / latest.json / 许可证等既有发布面；不改 Tauri 配置、版本、签名设置。
- 源码契约检查锁定 allowlist 与禁止项；不操作 PR #12、不合并 PR。

## 验收条件

1. 本地用 10-05 构建产物模拟该步骤：zip 仅含 9 个条目（3 个 exe、`_up_` 目录及其 2 个文件、`LICENSE`、`THIRD_PARTY_LICENSES.md`、`portable.marker`），路径用正斜杠，Expand-Archive 可正常解压。
2. `node scripts/check-wf08c-release-surface.mjs`、`check:wf08e-a15-release`、`node --test scripts/release-signing-source.test.mjs scripts/release-assets.test.mjs`、`check-line-budget` 通过。
3. 后续在 GitHub Actions 真实构建（workflow_dispatch 或下一个 rc tag）核对 ZIP 体积与条目；该步骤由维护者触发。

## 授权

维护者 2026-10-11 要求精简并选定方案 A；提交走分支 + PR，由助手创建 PR，不合并。
