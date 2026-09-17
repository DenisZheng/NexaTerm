# Task 01 安全与依赖硬化 · 交接给 Codex

> 更新时间：2026-09-17 ｜ 分支 `main`（Batch E 提交 `73e90af` 已推送；CI run `35172498650` 全绿，`Security evidence` job 与三个脱敏 artifact 已核验）
>
> **本文件是交接给下一位接手人的说明。** 标准协作规则见仓库根 `AGENTS.MD`（Codex 原生读取），本文件不重复，只补"当前位置 + 下一步 + 本任务专属的坑"。先 `git pull`，再从本文件"下一步"开始。
>
> **当前接手点**：capability 配置及独立 CI step 已完成。Batch E 已完成双轴审核、本地回归、提交和远端 CI 验证：`73e90af` / run `35172498650`。真实 runner GUI、CSP 和未解决 advisory 仍保留，不得据此归档 Task 01。审核记录见 `review-batch-e.md`。

## 当前上下文

- **项目**：NexaTerm（Tauri 2 + React 19 + Rust 桌面终端），Trellis 管理，规范在 `.trellis/spec/`。
- **任务**：`.trellis/tasks/09-10-security-and-dependency-hardening`（共 5 个 Phase）。
- **验证通道（关键约束）**：这台 Windows 机器缺少完整编译/链接环境（MSVC C++ 工作负载半装 + 缺 Windows SDK），`cargo check`/`cargo test` 本机跑不了；Rust 与 cargo-deny 审计工具已安装在自定义目录，设置 PATH 后可用，不能笼统记为工具缺失。编译验证有两条路径，任一可用即不得记 ENVIRONMENT-BLOCKED：
  - **(1) 本机/本环境有完整工具链**：直接按 `implement.md`"验证命令基线"跑 `cargo check --workspace --locked` + `cargo test --workspace --locked`（Codex 若在具备工具链的环境接手——如 Mac + Xcode CLT，优先走这条，更快）。
  - **(2) 无本地工具链**：push 到 `main` 触发 `.github/workflows/ci.yml`（frontend job + Rust 三平台矩阵 linux-x64 / windows-x64 / macos-arm64，各跑 `cargo check` + `cargo test`），记录 commit SHA + job 结论作为证据。
  - 前端 `pnpm run check` / `node scripts/check-startup-module-boundary-source.mjs` 本机可跑。

## 进度总览

| Phase | 状态 | 说明 |
| --- | --- | --- |
| 1 审计与威胁模型 | ✅ 完成 | 见 `SECURITY_REVIEW.md`、`LICENSE_AUDIT.md`。 |
| 2 低风险硬化 | 🟡 部分 | Batch A/B/D 完成；Batch C 配置拆分已完成（@ `443e4a8`），真实 runner 回归与 Batch E 其余门禁仍待做。 |
| 3 MCP 与错误边界 | ✅ 完成 | 第 1/2/4 步 CI 全绿 run 34918439293 @ `f59076c`；第 3 步 CI 全绿 run 34953115609 @ `4caaf0d`。 |
| 4 输入边界与生命周期 | ❌ 未开始 | |
| 5 CSP/跨平台/发布门禁 | ❌ 未开始 | |

### Phase 3 已落地内容（本轮）

- **MCP 监听策略**：默认 `127.0.0.1`；非 loopback 需显式 `remote_exposure_acknowledged`；单一 seam `resolve_effective_remote_host`；DTO 增 `remote_host_stored`/`remote_host_downgraded`，加载**不回写存储**；`save_settings` 对"非 loopback + 未确认"以 `mcp_remote_host_not_acknowledged` fail-fast。`is_loopback_host` 在 `mcp.rs` 与前端 `mcpSettingsTypes.ts` 双侧同义。
- **新增强制实现（非仅补测试）**：sidecar 进程内限流（按来源固定窗口 + 认证失败指数退避，loopback 300/min、远端 60/min）；并发连接分池（loopback 64 / 远端 16，不排队直接拒）；`mcp.rs` 命令 8 KiB 上限（拒绝而非截断，不回显命令体）。
- **`AppError` 按 `design.md` §5.3 收敛**：
  - 第 1 步 ✅ 网络失败在 Rust 侧按 `io::ErrorKind` 落稳定 `code`（`session.rs` 的 `refine_network_code`/`app_error_from_io`；前端新增 `connectionErrorCodes.ts`，`WorkspaceShell.tsx`/`ConnectionDialog.tsx` 改读 code，不再匹配 OS 错误文本）。
  - 第 2 步 ✅ 加 `diagnostic_id`（在 `new()` 内生成，585 处调用点零改动；诊断日志只记 code/id/recoverable，不记 `raw_message`）。
  - 第 4 步 ✅ 前端全部 `raw_message` 读取点退回诊断 ID / message。
  - 第 3 步 ✅ 已完成（阻塞已解除，commit `4caaf0d`，CI 全绿 run 34953115609），完整记录见"下一步 0"。

## 下一步（按优先级）

### 0. §5.3 第 3 步 —— ✅ 已完成（commit `4caaf0d`，CI 全绿 run 34953115609）

阻塞根因是 `raw_message` 同时承担两条结构化数据通道，直接加 `skip_serializing` 会造成功能回归：

- **前端通道**：`hostKeyErrors.ts` 曾把 `raw_message` 当 JSON 解析出 `HostKeyInfo`，关闭后主机密钥 TOFU 确认弹窗拿不到指纹 = 关掉 host key 校验的用户可见环节。
- **Rust 内部通道**：`session.rs` 的 `to_russh_error`/`app_error_from_russh` 把整个 `AppError` 序列化成 JSON 塞进 `io::Error` 再解析回来。

**用户已选定的数据模型**：host key 载荷迁到 `AppError` 的独立字段 `details: Option<AppErrorDetails>`，`AppErrorDetails` 是按 `kind` 判别的枚举（`host_key_unknown { host_key }` / `host_key_changed { host_key, old_fingerprint_sha256 }`）。选它而非自由 `serde_json::Value`，是因为后者只是把"什么都能往里塞"的问题换个字段重演——前端仍要做形状嗅探，新增载荷不经任何评审。

**已落地**（工作区 7 个文件，详见 `implement.md` §5.3 条目）：

- `app_error.rs`：新增 `AppErrorDetails` 枚举与 `details` 字段（`skip_serializing_if = "Option::is_none"`，无载荷错误的线上表示不变）；`raw_message` 加 `#[serde(default, skip_serializing)]`；新增 `AppError::to_internal_json()` —— 序列化后把 `raw_message` 显式写回，供内部通道使用。
- `session.rs`：`to_russh_error` 改用 `to_internal_json`。**这是易漏的一处**：直接用 `serde_json::to_string` 会让 `raw_message` 在跨 russh 边界时被 `skip_serializing` 静默丢掉，而这条通道在进程内，本就不受"不向 WebView 暴露"的约束。反向解析不用改（`skip_serializing` 只影响序列化方向）。
- `ssh_config.rs`：两个构造函数改 `.with_details(...)`，`raw_message` 降级为人类可读指纹摘要。
- `hostKeyErrors.ts`：改读 `details` 判别联合，不再 `JSON.parse`；`code` 为权威判别字段，`details.kind` 与之不一致则返回 `null`（宁可不出确认卡片，也不展示错的风险等级）。
- 契约文档同步：`.trellis/spec/{backend,frontend}/tauri-command-contracts.md`。

**已验证**：`npx tsc --noEmit` 干净；`node --test scripts/*.test.mjs` 37/37 通过；`check-startup-module-boundary-source.mjs`、`check-connection-dialog-host-key-feedback.mjs` 通过。

**Rust 验证（已完成，经 CI）**：commit `4caaf0d` push 后触发 run 34953115609，Frontend checks 与 Rust 三平台（linux-x64 / windows-x64 / macos-arm64）`cargo check` + `cargo test` 全部 success（Package windows-x64 为 build-only，非 tag/dispatch 触发故 skipped，属预期）。本机工具链本轮复核仍 ENVIRONMENT-BLOCKED（MSVC CRT 的 `include/vcruntime.h`、`lib/x64/msvcprt.lib` 与 Windows Kits 10 Include 均缺失；另注意 `which -a link.exe` 命中 Git coreutils 的 `/usr/bin/link.exe`，其 `link: extra operand` 是**误导性表象**、非根因），故走 CI 通道达成 Rust 验收。

**新增用例**（已随 run 34953115609 全部通过）：`app_error.rs` 的 `ipc_serialization_drops_raw_message`、`internal_json_preserves_raw_message`、`details_survive_ipc_round_trip`、`details_field_is_omitted_when_absent`、`host_key_changed_details_carry_old_fingerprint`；`session.rs` 的 `russh_app_error_mapping_preserves_host_key_details`。注意 `round_trip_preserves_diagnostic_id` 中原有的 `raw_message` 相等断言已**按设计移除**（IPC 序列化不再携带它），改由 `internal_json_preserves_raw_message` 覆盖内部通道。

### 1. Batch C（Phase 2 遗留）

按 `SECURITY_REVIEW.md §5` 完成了 main / `vnc-runner-host` capability 拆分和静态策略单测（@ `443e4a8`）。当前工作区已把 `check:tauri-capabilities` 接入 CI；仍需在 GUI/完整工具链环境用 `tauri dev` 验证 runner 窗口打开、复用、关闭及未授权边界。

### 2. Batch E（Phase 2 遗留）

capability 独立检查已在 `55a2cb7` / run `35085375573` 实际通过。本轮实现 `check:secrets`、`audit:npm`、`audit:rust` 与独立 `Security evidence` CI job；按用户确认，密钥硬阻断，依赖先报告（`REVIEW-REQUIRED` 不是安全验收），工具或网络故障仍失败。完整 Git 历史及受跟踪的 dirty 工作树都扫描，夹具仅按具体规则/文件/源码指纹豁免。

本地真实工具验证：Gitleaks 无未豁免命中；npm 为 1 low；Rust 为 4 vulnerability + 6 unmaintained + 3 unsound。没有自动风险接受或依赖升级。审核发现的 3 项 P2 均已修复：测试 CLI 污染 Actions 摘要、合法 npm 可选字段误判、npm 严重度计数与明细未逐项核对。脚本回归含真实 Gitleaks 临时 Git 仓库测试，审核后共 55/55 通过、无跳过；真实 pnpm 11.22.0 的 loopback 模拟 registry 也验证了可选字段语义。远端 run `35172498650`（commit `73e90af`）的 Frontend checks、Rust linux-x64 / windows-x64 / macos-arm64 和 Security evidence 全部 success；Windows package job 按 push 触发条件 skipped。Security evidence 的 13/13 真实工具测试无跳过，813 个受跟踪文件和 219 个历史提交的密钥扫描 PASS，三个 JSON artifact 已核验为白名单文件且无原始敏感字段。CSP 检查和 GUI 验收仍待完成。契约及复现命令见 `.trellis/spec/backend/security-evidence.md`。

### 3. Phase 4 输入边界与生命周期

- remote exec / Docker / WebDAV / remote file / tunnel / shell quoting 的 Windows + POSIX 负向用例。
- PTY / runner / tunnel / websocket / MCP sidecar / VNC runner host 的成功/失败/取消/窗口关闭四类清理路径源码级核查 + `cargo test`（经 CI）验证。
- Vault 回读、known-host changed 拒绝、连接失败语义回归。

### 4. Phase 5 CSP / 跨平台 / 发布门禁

按实际资源收紧 CSP，记录必须保留的 `unsafe-inline`/`data:`/`blob:` 调用点；跨平台 capability/权限/端口 bind 验证（macOS/Linux 本机不具备则记阻塞）；发布门禁。

## 给 Codex 的接手说明（本任务专属技术坑）

标准协作规则（英文提交信息 / 中文注释文档 / 动手前先对齐 / 复用 `src/shared/ui/` + `--mx-*` token / 覆盖亮色·显式暗色·system-dark / 不自动提交推送）见 `AGENTS.MD`，此处不重复。下面只列本任务踩过的技术坑：

- **提交/推送权限**：`AGENTS.MD` 要求"不自动提交或推送，先暂存等人工审核"。上一个会话的"结束并 Push"是**那次会话的一次性显式授权**，不构成常设权限——你接手后默认回到"暂存待审核"，除非用户对你的任务再次明确授权。
- **`cargo check`（不带 `--tests`）不编译 `#[cfg(test)]` 模块**：check 失败即错误在生产代码，不在测试。上一轮 `mcp.rs:1312` 的 E0308（`format!` 的 `String` 传给 `AppError::new` 的 `&str` 形参）就是这么定位的。
- **bin `mxterm_mcp` 依赖 lib**（`use m_xterm_lib::...`）：lib 编译失败时该 bin 不被检查，其错误要等 lib 修好后才首次暴露。核查生产代码要把 lib 和 bin 一起看。
- **`AppError::new` 签名未变**（仍 4 参 `code:&str, message:&str, raw_message:impl ToString, recoverable:bool`）：`diagnostic_id` 与 `details` 都不进构造参数——前者在 `new()` 内生成，后者靠链式 `.with_details(...)` 附加，故 585 处既有调用点无需改。新写调用时注意 `message` 是 `&str`（传 `format!` 要加 `&`），`raw_message` 是 `impl ToString`（`String` 可直接传）。
- **`AppError` 有两套序列化，别混用**：面向 WebView 的 `serde_json::to_string` 会按 `skip_serializing` 摘掉 `raw_message`；进程内通道（目前只有 `session.rs` 的 `to_russh_error`）必须用 `AppError::to_internal_json()`。以后若再新增"序列化 `AppError` 再解析回来"的内部通道，同样走后者，否则内部诊断文本会**静默**丢失——没有编译错误，只有排障时发现原始文本空了。
- **新增需要前端消费的错误载荷时**：登记到 `app_error.rs` 的 `AppErrorDetails` 枚举新变体，不要塞回 `raw_message`，也不要改成自由 JSON。这个枚举就是那道评审闸门。
- **CI 日志下载需 repo admin 权限**：上个会话本机无 token，只能读 `api.github.com` 的 runs/jobs 元数据、靠用户粘贴报错定位。你若走 CI 路径且能拿到日志更好。
- **`ENVIRONMENT-BLOCKED` 项不得从验收抹掉**，须单独成节写清缺哪项环境能力：目前有 `McpRemoteServiceManager::restart`/`reconcile`（签名需 `AppHandle`，单测无法构造 Tauri 运行时；`stop` 不需要、已覆盖），以及 Batch C 的 `tauri dev` runner 窗口回归。
- **08-01 的"checkbox + 脚注"反模式**：用户已明确**先不管，后续复现再提**。

## 证据索引

- Phase 3 CI 全绿：run 34918439293 @ `f59076c`（frontend + Rust 三平台 `cargo check`+`cargo test` 全 success），覆盖 §5.3 第 1/2/4 步。
- §5.3 第 3 步 CI 全绿：run 34953115609 @ `4caaf0d`（Frontend + Rust 三平台 `cargo check`+`cargo test` 全 success）。
- Phase 3 编译修复：`875b3f4`（首推，`mcp.rs:1312` E0308）→ `f59076c`（借用为 `&str`）。
- Batch B CI 绿：`1a8e95e`；Windows PTY 用例首次真绿：`58f6172`。
- 详尽逐条状态：`implement.md`（Phase 3 段 + "环境能力变更记录"节）。
