# Task 01 · 安全评审记录（2026-09-19）

> 范围：提交区间 `1ead18f..3e26b48`（Task 01 自 2026-09-10 起的全部代码改动，52 个文件，约 +4852/-498 行；文档、锁文件、纯测试文件不计）。评审方式：只读源码与 diff 追踪，不改代码、不跑构建。标准：只报告可利用性置信度 ≥ 8/10 的问题；DoS、资源耗尽、过期三方库、纯加固建议不在范围内（三方库 advisory 见 `docs/SECURITY_REVIEW.md` §7）。

## 结论

**无高置信度漏洞。** 以下敏感路径逐一核查并判定安全：

| 路径 | 判定依据 |
| --- | --- |
| MCP 监听策略（`mcp.rs` `save_settings` / `resolve_effective_remote_host` / `spawn_remote_child`） | 非 loopback host 保存时必须带 `remote_exposure_acknowledged`，回到 loopback 时确认位自动清除；sidecar 以**生效值**启动，存量 `0.0.0.0` 未确认会在 `TcpListener::bind` 前降级为 `127.0.0.1`；监听地址只来自父进程 CLI 参数 |
| MCP 认证与 Origin（`bin/mxterm_mcp.rs` `request_authorized` / `origin_allowed`；`mcp.rs` `verify_remote_token`） | 每个 `/mcp` 请求都需 bearer 或 `x-mxterm-mcp-token`，SHA-256 哈希 `constant_time_eq` 比较；Origin 门在其前；DNS rebinding 可过 Origin 门但过不了 token；`cors_headers` 不回显被拒 Origin；工具错误经 `serde_json::to_string` 序列化，`raw_message` 被 `skip_serializing` 剔除 |
| 脚本参数 shell 引用（`mcp.rs` `build_execute_script_command` / `parse_script_args`） | args 经 shell 风格分词（拒绝未闭合引号），每个 token 与 interpreter、remote_path 均过 `quote_posix_shell`；原先的裸插值注入路径已关闭 |
| AppError IPC / 内部通道分离（`app_error.rs`） | `raw_message` `skip_serializing`；仅 `to_internal_json` 回填，唯一消费者是 `session.rs::to_russh_error` 进程内往返；`russh::Error::IO` 文本来自 OS socket 层而非远端 SSH peer，远端无法伪造 JSON `AppError`；`log_diagnostic` 只打 code / diagnostic_id / recoverable；`AppErrorDetails::HostKey*` 仅含指纹与公钥 |
| Host key 信任流（`session.rs::check_server_key`、`storage_repository.rs::known_host_check`、`commands.rs::known_host_trust`、`hostKeyErrors.ts`） | `Changed` 恒映射 `Err(host_key_changed)`；唯一写路径是确认弹窗触发的显式 `known_host_trust`；host 查找前归一化，大小写/空白变体不能把 Changed 变成 Unknown；前端以 `code` 为准且要求 `details.kind` 一致 |
| 路径边界（`remote_files.rs` 相对段校验、`local_relative_path` 的 `starts_with(root)`；`webdav.rs` / `webdav_sync.rs` dot-segment 拒绝；`commands.rs::require_safe_name`） | 服务端返回的目录名含 `/`、`\`、NUL、`.`、`..` 即拒绝，解析后的本地路径校验仍在下载根内；WebView 传入的绝对远程路径是设计如此（SFTP 浏览器以用户自身凭据操作） |
| Tauri capability 与 CSP（`capabilities/*.json`、`tauri.conf.json`） | 生产 CSP `script-src 'self'`、无 `unsafe-eval`、`object-src 'none'`、`base-uri 'self'`、`frame-src 'none'`、`connect-src` 限 IPC 与 `ws://127.0.0.1:*`；`unsafe-inline` 仅 `style-src`（xterm/Monaco 需要）及 devCsp 的 `script-src`；runner-host 仅事件权限；两个窗口都只加载打包的同源前端 |
| CI 与脚本（`ci.yml`、`release.yml`、`security-check.mjs`、`install-security-tool.ps1`） | `run:` 里的 `${{ }}` 只有 `matrix.*`、`github.sha`、`secrets.*`；触发器是 `push` / `pull_request` 而非 `pull_request_target`；security job `persist-credentials: false`；`spawnSync` 参数数组无 shell；安装器校验固定 SHA-256 |

## 低于阈值的观察（非漏洞，需维护者知晓）

1. **`execute_script` 绕过危险命令策略**（`mcp.rs:1264-1273`，既有行为）：`ensure_dangerous_command_allowed` 只扫描包装串（`chmod +x … && sh … ; rm -f …`），`execute_script` 固定传 `confirm_dangerous = true`。已认证的 MCP 客户端可上传含 `rm -rf /` 的脚本并在未开启 `allow_dangerous_commands` 时执行。该客户端本就能通过 `execute_command` 执行任意命令，因此是策略一致性缺口而非权限边界突破。建议：扫描脚本体，或要求调用方显式传 `confirm_dangerous`。
2. **应用命令未按窗口做 ACL**（`src-tauri/build.rs` 为裸 `tauri_build::build()`，无 app manifest）：`vnc-runner-host` 独立 capability 只限制 core/plugin 权限，`generate_handler!` 里全部 `#[tauri::command]` 仍可从 runner-host webview 调用。该 webview 在 `script-src 'self'` 下只跑第一方代码，今天没有攻击者脚本可利用，但隔离度低于 capability 文件描述（"Minimal capability"）所暗示。若要强制，用 `tauri_build::Attributes::app_manifest(AppManifest::new().commands(&[...]))` 并在 `default.json` 列出命令。这也意味着 implement.md 里"runner 窗口内 `invoke("secret_vault_status")` 应被拒绝"的预期**不成立**，需按此修正。
3. **`origin_allowed` 接受任意 loopback Origin 而不看绑定 host**（`bin/mxterm_mcp.rs:918-931`）：`http://localhost:<任意端口>` 的页面可过 Origin 门并得到宽松 CORS 响应；仍需 token，无直接利用，但 token 成为本地跨源调用的唯一防线。

## 处置

- 观察 1、2 记为 Task 01 归档后的独立小任务候选（均为策略收紧，不阻塞归档）。
- 观察 2 已同步修正 `implement.md` 中的越权边界预期。
- 观察 3 不处理：与 MCP 监听策略设计一致（token 为主防线）。
