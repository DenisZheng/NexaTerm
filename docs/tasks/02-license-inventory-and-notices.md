# Task 02：许可证清单与第三方 notices

## Goal

建立覆盖 npm、Cargo、字体/图标、sidecar、外部 runner、安装器和构建产物的许可证证据，并生成可发布的 THIRD_PARTY_LICENSES.md。

## Background

主 LICENSE 为 MIT；package-lock 含 noVNC MPL-2.0、dompurify 双许可证和 CC0 图标；仓库尚无第三方清单，Cargo.lock 未含 license metadata。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/LICENSE_AUDIT.md 与 NEXATERM_REQUIREMENTS.md 第 46 节`

## Current Implementation

package-lock 可提供 npm license 初查；Tauri 配置包含 icons、bundled SQLite 和 mxterm-mcp sidecar；RDP/VNC/串口平台 runner 尚未完整盘点。

## Reusable Components

package/pnpm lock、Cargo manifest/lock、Tauri bundle 配置、现有 LICENSE、构建脚本和 release scripts。

## Scope

选定唯一包管理/lock 来源；运行 cargo deny/license、npm license/SBOM；盘点直接/传递依赖、MPL 修改文件、资源和二进制；生成 notices 与 CI 检查。

## Out of Scope

不复制外部代码、不改变许可证、不为了清单升级无关依赖、不把协议不清晰包默认为可用。

## Dependencies

Task 00 工具链；Task 01 的依赖升级结果；发布/安装器环境用于 binary 和签名清单。

## Technical Approach

建立机器可读 inventory，再人工复核许可证文本、版权、来源、版本、hash、修改状态和再分发限制；MPL 依赖保持文件级边界。

## Files likely affected

新增 THIRD_PARTY_LICENSES.md（后续）、可能 scripts/license-inventory.*、docs/LICENSE_AUDIT.md、package/pnpm lock、Cargo manifests、bundle/installer metadata。

## Acceptance Criteria

- [ ] npm/Cargo/asset/binary/installer inventory 可追溯。\n- [ ] noVNC/serialport-rs 等 MPL 义务完整。\n- [ ] GPL/未知协议和外部安装依赖有阻断或明确说明。\n- [ ] notices 随构建产物提供，CI 能检测新增无 license 依赖。

## Test Plan

锁文件解析、license allow/deny、构建产物清单、MPL 文件头/notice 检查、Windows/macOS/Linux installer smoke。

## Cross-platform Notes

分别记录平台 runner、系统库、FreeRDP/XQuartz/X11、串口驱动和签名工具的许可与是否由用户另装。

## Security Notes

许可证扫描日志不应包含私有 registry token；二进制 hash 和来源用于供应链完整性校验。

## License Notes

主项目保持 MIT；MPL 仅按文件级义务处理；禁止将 GPL/AGPL/LGPL 或未知协议代码直接复制。

## Migration / Compatibility Notes

清单格式一旦发布需版本化；更换 lockfile 或 runner 要保留旧版本报告和差异，避免升级后遗漏 notices。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
