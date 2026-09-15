# Task 01 安全与依赖硬化 · 会话交接

> 更新时间：2026-09-15 ｜ 分支 `main` ｜ HEAD `26a23fc`（已同步 `origin/main`，工作区干净）
>
> 本文件是跨会话/跨机器交接说明。详尽的逐条验收状态与证据在 `implement.md`；本文件只做"当前位置 + 下一步 + 坑"的快速定位。新会话 `git pull` 后从这里接。

## 当前上下文

- **项目**：NexaTerm（Tauri 2 + React 19 + Rust 桌面终端），Trellis 管理，规范在 `.trellis/spec/`。
- **任务**：`.trellis/tasks/09-10-security-and-dependency-hardening`（共 5 个 Phase）。
- **验证通道（关键约束）**：本机 Windows 无可用 Rust 工具链（MSVC C++ 工作负载半装 + 缺 Windows SDK），`cargo check`/`cargo test` 本机跑不了。**所有 Rust 编译/测试验收走 CI**——push 到 `main` 触发 `.github/workflows/ci.yml`（frontend job + Rust 三平台矩阵 linux-x64 / windows-x64 / macos-arm64，各跑 `cargo check --workspace --locked` + `cargo test --workspace --locked`）。前端 `pnpm run check` / `node scripts/check-startup-module-boundary-source.mjs` 本机可跑。

## 进度总览

| Phase | 状态 | 说明 |
| --- | --- | --- |
| 1 审计与威胁模型 | ✅ 完成 | 见 `SECURITY_REVIEW.md`、`LICENSE_AUDIT.md`。 |
| 2 低风险硬化 | 🟡 部分 | Batch A/B/D 完成（B 经 CI 绿 @ `1a8e95e`）；**Batch C、E 未做**。 |
| 3 MCP 与错误边界 | ✅ 完成 | **CI 全绿实证** run 34918439293 @ `f59076c`；§5.3 第 3 步**刻意留空**（见下）。 |
| 4 输入边界与生命周期 | ❌ 未开始 | |
| 5 CSP/跨平台/发布门禁 | ❌ 未开始 | |

### Phase 3 已落地内容（本轮）

- **MCP 监听策略**：默认 `127.0.0.1`；非 loopback 需显式 `remote_exposure_acknowledged`；单一 seam `resolve_effective_remote_host`；DTO 增 `remote_host_stored`/`remote_host_downgraded`，加载**不回写存储**；`save_settings` 对"非 loopback + 未确认"以 `mcp_remote_host_not_acknowledged` fail-fast。`is_loopback_host` 在 `mcp.rs` 与前端 `mcpSettingsTypes.ts` 双侧同义。
- **新增强制实现（非仅补测试）**：sidecar 进程内限流（按来源固定窗口 + 认证失败指数退避，loopback 300/min、远端 60/min）；并发连接分池（loopback 64 / 远端 16，不排队直接拒）；`mcp.rs` 命令 8 KiB 上限（拒绝而非截断，不回显命令体）。
- **`AppError` 按 `design.md` §5.3 收敛**：
  - 第 1 步 ✅ 网络失败在 Rust 侧按 `io::ErrorKind` 落稳定 `code`（`session.rs` 的 `refine_network_code`/`app_error_from_io`；前端新增 `connectionErrorCodes.ts`，`WorkspaceShell.tsx`/`ConnectionDialog.tsx` 改读 code，不再匹配 OS 错误文本）。
  - 第 2 步 ✅ 加 `diagnostic_id`（在 `new()` 内生成，585 处调用点零改动；诊断日志只记 code/id/recoverable，不记 `raw_message`）。
  - 第 4 步 ✅ 前端全部 `raw_message` 读取点退回诊断 ID / message。
  - 第 3 步 ⛔ **见下方阻塞项**。

## 下一步（按优先级）

### 1. §5.3 第 3 步 —— 阻塞，需先与用户对齐数据模型后再动手

目标：给 `AppError.raw_message` 加 `#[serde(skip_serializing)]`。**当前不能直接加**，因为 `raw_message` 同时是两条结构化数据通道：

- **前端通道**：`src/features/connections/hostKeyErrors.ts:19` 把 `raw_message` 当 JSON 解析出 `HostKeyInfo`（由 `ssh_config.rs` 的 `app_error_for_host_key_unknown`/`app_error_for_host_key_changed` 写入）。关闭后主机密钥 TOFU 确认弹窗拿不到指纹 = 关掉 host key 校验的用户可见环节。
- **Rust 内部通道**：`session.rs` 的 `to_russh_error`/`app_error_from_russh` 把整个 `AppError` 序列化成 JSON 塞进 `io::Error` 再解析回来。已给 `raw_message` 加 `#[serde(default)]` 兜住（字段消失后仍能解析，否则 `host_key_unknown` 会被静默降级），用例 `russh_app_error_mapping_preserves_diagnostic_id` 锁住。

**待对齐的决策（AGENTS.MD"动手前先对齐"）**：host key 载荷是迁到 `AppError` 独立结构化字段（如 `details: Option<serde_json::Value>`），还是改独立命令返回。定了再落第 3 步 + `hostKeyErrors.ts` 改造。

### 2. Batch C（Phase 2 遗留）

删除未用 capability、按窗口拆分配置。拆分矩阵已在 `SECURITY_REVIEW.md §5` 就绪，但需 `tauri dev` 验证 `vnc-runner-host` runner 窗口不回归——**需 GUI 环境（Mac 上可做）**。

### 3. Batch E（Phase 2 遗留）

补 secret scan / audit artifact / 配置静态检查脚本（`scripts/check-*.mjs`），输出明确 PASS/FAIL/ENVIRONMENT-BLOCKED。断言依赖 Batch C 与 Phase 5 结果，随其一并落地，避免"提交即失败"的 check。

### 4. Phase 4 输入边界与生命周期

- remote exec / Docker / WebDAV / remote file / tunnel / shell quoting 的 Windows + POSIX 负向用例。
- PTY / runner / tunnel / websocket / MCP sidecar / VNC runner host 的成功/失败/取消/窗口关闭四类清理路径源码级核查 + `cargo test`（经 CI）验证。
- Vault 回读、known-host changed 拒绝、连接失败语义回归。

### 5. Phase 5 CSP / 跨平台 / 发布门禁

按实际资源收紧 CSP，记录必须保留的 `unsafe-inline`/`data:`/`blob:` 调用点；跨平台 capability/权限/端口 bind 验证（macOS/Linux 本机不具备则记阻塞）；发布门禁。

## 给下个会话的坑与规则

- **提交信息用英文**（项目规则显式覆盖全局的中文规则）；代码注释、文档、UI 文案仍**中文**。
- 每次回答开头 `Model: <标识>`，不编造版本号/日期。
- UI 改动走 `ui-ux-pro-max`，复用 `src/shared/ui/` + `src/styles/tokens.css` 的 `--mx-*` token；同时覆盖亮色 / 显式暗色 / system-dark。
- **CI 日志本机拉不到**：下载 job 日志需 repo admin 权限，本地无 token（`api.github.com` 只读 runs/jobs 元数据可用）。定位编译错误靠"读提交 diff + 用户粘贴报错"——本轮 `mcp.rs:1312` 的 E0308 即如此定位。
- `cargo check`（不带 `--tests`）**不编译 `#[cfg(test)]` 模块**：check 失败说明错误在生产代码；且 bin `mxterm_mcp`（`use m_xterm_lib::...`）依赖 lib，lib 编译失败时 bin 不被检查，其错误在修好 lib 后才首次暴露——检查生产代码要连 bin 一起看。
- **`ENVIRONMENT-BLOCKED` 项不得从验收抹掉**，须单独成节写清缺哪项环境能力：目前有 `McpRemoteServiceManager::restart`/`reconcile`（签名需 `AppHandle`，单测无法构造 Tauri 运行时；`stop` 不需要、已覆盖）、Batch C 的 `tauri dev` runner 窗口回归。
- **不自动提交/推送需人工审核**，但本任务收尾阶段用户已显式授权"结束并 Push"。
- 08-01 的"checkbox + 脚注"反模式：用户已明确**先不管，后续复现再提**。

## 证据索引

- Phase 3 CI 全绿：run 34918439293 @ `f59076c`（frontend + Rust 三平台 `cargo check`+`cargo test` 全 success）。
- Phase 3 编译修复：`875b3f4`（首推，`mcp.rs:1312` E0308）→ `f59076c`（借用为 `&str`）。
- Batch B CI 绿：`1a8e95e`；Windows PTY 用例首次真绿：`58f6172`。
- 详尽逐条状态：`implement.md`（Phase 3 段 + "环境能力变更记录"节）。
