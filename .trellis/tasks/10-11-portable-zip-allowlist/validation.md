# Portable ZIP allowlist 验证（2026-10-11）

## 改动

- `.github/workflows/release.yml`：Windows portable 组装改为显式 allowlist（`nexaterm.exe`、`nexaterm-mcp.exe`、`mxterm-mcp.exe`、`_up_/`、`LICENSE`、`THIRD_PARTY_LICENSES.md`、`portable.marker`），任一缺失即 `::error::` + `exit 1`；压缩改用 `$SYSTEMROOT/System32/tar.exe`（bsdtar）生成标准 zip，并在日志打印条目列表。
- `scripts/check-wf08c-release-surface.mjs`：锁定 allowlist 关键行，禁止 `find src-tauri/target/release -mindepth 1 -maxdepth 1` 整目录复制与 `Compress-Archive`。
- `.trellis/spec/backend/quality-guidelines.md`：新增 "Windows Portable ZIP Allowlist Gate" 场景。

## 本地模拟（10-05 本地构建产物 + 故意放入的残留）

- 模拟目录 `.trellis/.runtime/a15-rc-2026-10-11/portable-sim/`，除三个 exe 与 `_up_/` 外还放入 `nexaterm.pdb`、`nexaterm.d`、`.cargo-lock`、`.fingerprint/`、`nsis/` 残留。
- 从修改后的 release.yml 提取 windows-x64 块，以 `set -euo pipefail` 执行：exit 0。
- 产物 `NexaTerm-portable-windows-x64.zip`：23,428,669 字节，9 个条目（3 个 exe、`_up_/` 及其 2 个文件、`LICENSE`、`THIRD_PARTY_LICENSES.md`、`portable.marker`）；`System.IO.Compression.ZipFile` 读取条目全部无反斜杠；`Expand-Archive` 解压正常；解压后 `nexaterm.exe` / `nexaterm-mcp.exe` 哈希与源构建一致；marker 内容为 `portable`。
- 对照 rc.1 实际发布包（2707 条目 / 29,428,009 字节 / 解压约 79 MB），预计变为 9 条目 / 约 23 MB / 解压约 57 MB。

## 静态检查

- `node scripts/check-wf08c-release-surface.mjs`、`check-wf08a-release-migration-source.mjs`、`check-wf08e-a15-release-source.mjs`：PASS。
- `node --test scripts/release-signing-source.test.mjs scripts/license-notice-source.test.mjs scripts/release-assets.test.mjs scripts/build-platform.test.mjs`：全部通过。
- `node scripts/check-line-budget.mjs`：ok。
- 本机没有 YAML 解析器（无 pyyaml / js-yaml / ruby），workflow 语法未做本地解析；改动全部位于既有 `run: |` 块内，缩进保持不小于 10 空格。

## 未完成 / 边界

- 真实 GitHub Actions 构建尚未执行：需在分支上以 `workflow_dispatch` 运行 release.yml（不创建 Release）或等下一个 rc tag 核对实际 ZIP。
- 不修改 Tauri 配置、版本、签名；不操作 PR #12、不合并 PR。

## 真实构建核对（2026-10-11，workflow_dispatch run 38135174315）

- 在 `fix/portable-zip-allowlist` @ `3ca0354` 上以 manual 模式触发 release.yml（不创建 Release）：policy、Build linux-x64、Build macos-arm64、Build windows-x64、Prepare release assets 全部 success，Publish 按设计 skipped。
- artifact `nexaterm-windows-x64` 中的 `NexaTerm-portable-windows-x64.zip`：23,485,323 字节，9 个条目（`nexaterm.exe` 36,647,424、`nexaterm-mcp.exe` 10,104,832、`mxterm-mcp.exe` 10,126,848、`_up_/` 及其 `LICENSE` 与 `THIRD_PARTY_LICENSES.md`、顶层 `LICENSE`、`THIRD_PARTY_LICENSES.md`、`portable.marker`），路径均为正斜杠；SHA256 `7e496dc227f2b92f31aa54a65081df2d1933fff6f9a0d1b2312a03f9b076f1a7`。
- 对照 rc.1 发布包（29,428,009 字节 / 2707 条目）：体积减少约 5.9 MB，条目从 2707 降到 9，pdb / .d / .fingerprint / nsis / .cargo-* 残留全部排除。
- 同一 artifact 仍包含 `NexaTerm_0.1.17-rc.1_x64-setup-windows-x64.exe`（17,507,099 字节）、其 `.sig` 与许可证文件，安装包链路未受影响。
