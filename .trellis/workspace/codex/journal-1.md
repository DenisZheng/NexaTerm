# Journal - codex (Part 1)

> AI development session journal
> Started: 2026-06-06

---


## Session 1: 完成 NexaTerm 架构审计与 Task 00 基线

**Date**: 2026-09-10
**Task**: 完成 NexaTerm 架构审计与 Task 00 基线
**Branch**: `main`

### Summary

完成需求、架构、差距、开发、测试、安全和许可证规划；安装 D 盘 Rust 工具链，记录 708 个锁定 crate、10 个 RustSec advisory，以及 Windows MSVC C++ 工具链不完整（缺 CRT 头文件/库与 Windows SDK）导致的 Rust 编译阻塞；未修改产品功能。

### Main Changes

- 新增 `docs/` 七份规划文档：`CURRENT_STATE.md`、`GAP_ANALYSIS.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`、`TEST_STRATEGY.md`、`SECURITY_REVIEW.md`、`LICENSE_AUDIT.md`。
- 新增 `docs/tasks/` 十个可执行任务文件（00 基线工具链 → 09 性能稳定性与发布门禁）。
- 建立 Trellis 父任务 `09-09-nexaterm-architecture-audit-plan` 与子任务 `09-09-nexaterm-baseline-toolchain-evidence`、`09-10-security-and-dependency-hardening`。
- 未修改产品源码、依赖声明、lockfile、数据库或运行时配置。

### Git Commits

| Hash | Message |
|------|---------|
| `f94d643` | 补充 NexaTerm 需求架构审计与工具链基线 |

### Testing

- [OK] `pnpm run check` 通过
- [OK] `pnpm run build` 通过（授权环境；Vite 报告若干 >500 kB chunk，非阻断）
- [OK] `node --test scripts/*.test.mjs` 37/37 通过；逐文件运行 7/7 测试文件通过
- [OK] `node scripts/check-startup-module-boundary-source.mjs` 通过
- [OK] `cargo metadata --locked --offline` 通过（708 个锁定 crate，1 个未声明许可证）
- [FAIL] `pnpm audit`（官方 registry）：0 critical / 5 high / 16 moderate / 5 low，共 191 dependencies
- [FAIL] `cargo-deny check advisories` 失败但已取得证据：10 个 RustSec advisory
- [BLOCKED] `cargo check` / `cargo test`：MSVC `link.exe` 不在 PATH；后续复核确认真因为 MSVC C++ 工作负载半装（缺 `include\`、`lib\x64`）且 Windows SDK 未安装
- [BLOCKED] `cargo audit`：工具未安装，由 cargo-deny advisories 提供临时 RustSec 证据
- [FAIL] 全部 `scripts/check-*.mjs`：50/60 通过，10 个失败（Rust 工具链阻塞 2 个、输出路径漂移 1 个、待修契约/样式基线若干）

### Status

[OK] **Completed**

### Next Steps

- Task 01（安全与依赖硬化）启动前需补齐 Rust 工具链：用 VS Installer 补装「MSVC v143 生成工具」+「Windows 11 SDK」，目标盘选 E: 或 D:（C 盘可用空间不足）。
- `cargo-deny` 的 license/source 门禁需先由独立任务配置 `deny.toml` 再启用，当前无配置时默认拒绝许可证，不代表项目违规。


## Session 2: Task 01 Phase 1 审计 + Phase 2 Batch A/D 硬化

**Date**: 2026-09-11
**Task**: Task 01 Phase 1 审计 + Phase 2 Batch A/D 硬化
**Branch**: `main`

### Summary

完成 Phase 1 审计/威胁模型落档；执行并验证 Phase 2 Batch A（npm override，high 5→0）+ Batch D（移除 package-lock）；Batch B/C/E 与 Phase 3-5 记 ENVIRONMENT-BLOCKED/延后。

### Main Changes

本会话完成 Task 01 的 Phase 1（审计与威胁模型）落档，以及 Phase 2 中 Windows 可验证批次（Batch A/D）的执行与验证。证据主档为 `docs/SECURITY_REVIEW.md`，执行进度见 `.trellis/tasks/09-10-.../implement.md`。

**Phase 1（审计与威胁模型）**

- npm：26 条 advisory（5 high / 16 moderate / 5 low，191 依赖）逐条归类。关键修正——5 个 high 全为 dev-only 构建链依赖、不进发布产物；唯一进生产包（`dev:false`）的是 dompurify（经 monaco-editor 传递）。
- Rust：cargo-deny 10 advisory + 3 yanked 逐条核对。可干净修 h2（RUSTSEC-2026-0258）+ 3 个 yanked；rsa 无修复版（绑 russh P0，列风险接受）；quick-xml / unic-* / proc-macro-error 属 tauri 生态自有。
- 已成表：威胁模型、capability 使用矩阵（vnc-runner-host 实际只需 5 项 window 权限）、CSP 资源盘点、风险接受登记。
- `cargo audit` 未安装 → ENVIRONMENT-BLOCKED，暂由 cargo-deny advisories 提供 RustSec 证据（二者不等价）。

**Phase 2 · Batch A（npm override 升级，已验证）**

- 发现并修正 pnpm 11 配置位置：overrides 从 `package.json` 的 `pnpm` 字段（pnpm 11 已废弃、install 时报 WARN 并忽略）改到 `pnpm-workspace.yaml` 顶层（官方文档 https://pnpm.io/settings/dependency-resolution ）。
- override 5 包至修复版：dompurify 3.2.7→3.4.15 / nanoid 3.3.12→3.3.18 / postcss 8.5.15→8.5.28 / browserslist 4.28.2→4.28.9 / baseline-browser-mapping 2.10.33→2.11.21。
- 验证链：`pnpm install`（Packages +9 -9）→ `pnpm run check` exit 0 → `pnpm run build` exit 0（3.7MB RemoteFileEditor/Monaco chunk 正常产出，dompurify 顶版不破坏构建）→ `pnpm audit`：high 5→0、moderate 16→0、critical 0。
- 残留仅 1 条 dev-only esbuild low：有意推迟（esbuild 与 vite API 强耦合，强升有破坏 build 风险，且 low + 仅构建期）。

**Phase 2 · Batch D（移除冗余 package-lock.json，已完成）**

- 全库核对无脚本/CI 依赖（CI 用 `pnpm install --frozen-lockfile`）；`remoteFileIcons.ts` 同名条目仅是远程文件浏览器的通用文件图标映射，与本仓库 lockfile 无关。
- Task 02 交接：`LICENSE_AUDIT.md` 原以 package-lock 为 npm 许可证清单基数，Task 02 的 npm 许可证来源改走 `pnpm licenses list` / pnpm-lock.yaml（与 LICENSE_AUDIT §25 建议一致）。

**延后（ENVIRONMENT-BLOCKED / 后续阶段，待 Mac + 完整工具链）**

- Batch B：`cargo update -p h2 -p chacha20 -p crypto-bigint -p der` + `cargo check` / `cargo test` 验证。
- Batch C：capability 按窗口拆分（main 全权限 + vnc-runner-host 5 项 window 权限），需 `tauri dev` 验证 runner 窗口不回归。
- Batch E：`scripts/check-*.mjs` 静态断言，随 Batch C / Phase 5 一并做（避免提交即失败的 check）。
- Phase 3（MCP 默认 loopback + AppError 四步收敛）、Phase 4（输入边界 + 生命周期清理）、Phase 5（CSP 收紧 + 发布门禁；updater endpoint 仍指向上游，须改为自有签名源）。

**本会话 Git 状态（未提交，待人工审核）**：`M pnpm-workspace.yaml` / `M pnpm-lock.yaml` / `D package-lock.json` / `M implement.md` / `M docs/SECURITY_REVIEW.md`；`package.json` 增删相抵、净零变更。


### Git Commits

(No commits - planning session)

### Testing

- Batch A（npm）：`pnpm run check` exit 0 / `pnpm run build` exit 0 / `pnpm audit` high 5→0、moderate 全清（仅剩 1 条 dev-only esbuild low）——PASS。
- Rust 编译类验证（`cargo check` / `cargo test`）：ENVIRONMENT-BLOCKED（本机 MSVC C++ 工作负载 / Windows SDK 不完整），待完整工具链环境。

### Status

进行中（Task 01 未完成）：Phase 1 审计/威胁模型已落档；Phase 2 Batch A + D 已执行并验证。Batch B/C/E 与 Phase 3/4/5 未完成（见「延后」）。

### Next Steps

- 换 Mac / 完整工具链后：Batch B（cargo update + 编译验证）、Batch C（capability 按窗口拆分 + tauri dev 验证）、Batch E（check-*.mjs 静态断言）。
- 继续 Phase 3（MCP loopback + AppError 收敛）、Phase 4（输入边界/生命周期）、Phase 5（CSP 收紧 + 发布门禁）。
- 本会话改动已暂存待人工审核；确认后再提交（不自动提交）。
