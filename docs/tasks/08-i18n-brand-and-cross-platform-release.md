# Task 08：i18n、品牌元数据与跨平台发布

## Goal

建立 English/zh-CN i18n 契约，统一 mXterm/NexaTerm 品牌和数据/更新兼容，并把三平台构建发布纳入可复核矩阵。

## Background

当前无 i18n catalog，大量硬编码中文；package/Tauri 仍有 m-xterm/MXterm；需求要求 English/zh-CN、Light/Dark 和三平台 build/run。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_PLAN.md、docs/TEST_STRATEGY.md、src/styles/tokens.css、src/styles/app.css`

## Current Implementation

React features 直接写中文、日期使用 zh-CN；main/App lazy boundary 和主题恢复已有，包元数据/identifier/更新配置需兼容评估。

## Reusable Components

共享 UI、Radix/Lucide、全局 token、现有 theme/windowState、Tauri bundle/updater 配置；不另造 feature 视觉体系。

## Scope

选择并配置 i18n 层、catalog/fallback、日期/错误/菜单格式；迁移核心路径；制定显示名/identifier/数据目录/更新兼容；构建 Windows/macOS/Linux artifacts。

## Out of Scope

不在本任务重设计 UI、不删除旧用户数据、不在未经对齐时强制更换 identifier、不把缺翻译静默显示空字符串。

## Dependencies

Task 01 安全/metadata、Task 02 license/notices、Task 03 tests、Task 07 platform runners；品牌迁移需产品决策确认。

## Technical Approach

先列硬编码文案清单和 key 规范，再迁移共享/核心路径；fallback 显式；品牌先加兼容映射和升级测试，再变更可见元数据。

## Files likely affected

package.json、src i18n/shared 文案、App/Workspace/settings/features、tauri.conf.json、updater/config、installer workflows、docs。

## Acceptance Criteria

- [ ] English/zh-CN 切换和 fallback 有测试，核心流程无硬编码漏出。\n- [ ] Light/Dark/system-dark 仍符合全局 token。\n- [ ] 品牌、identifier、数据目录和 updater 兼容有迁移说明。\n- [ ] 三平台 build/run/install smoke artifacts 可追溯。

## Test Plan

i18n unit/component/E2E、locale/日期/错误 formatter、theme source checks、pnpm build、Tauri platform build/install/update smoke。

## Cross-platform Notes

Windows NSIS/MSI、macOS Intel/Apple Silicon DMG/sign/notarize、Linux AppImage/deb 等按实际支持矩阵记录；shell locale 与字体差异纳入检查。

## Security Notes

翻译不可插入未经转义的 HTML；更新 endpoint/key 不因改名丢失；构建日志不泄露签名凭据。

## License Notes

翻译、字体、图标、品牌资源和 installer 依赖进入 notices；新增 i18n 库经 Task 02 审核。

## Migration / Compatibility Notes

保留旧存储 identifier/目录和 updater 兼容；locale 缺失回退 English；品牌迁移失败可回退旧显示名而不破坏数据。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
