# Phase 4：输入边界负向验证设计

## 1. 边界与数据流

本子任务只处理“用户/前端请求 → Rust 校验/规范化 → 远端 shell、Docker CLI、WebDAV URL 或 tunnel parser”的边界，不改变连接解析、Vault、协议和前端交互。

| 入口 | Rust 所有者 | 最终边界 | 主要证据 |
|---|---|---|---|
| remote exec / shell quoting | `remote_files.rs`、`network_tools.rs`、`mcp.rs`、`terminal/session.rs` | POSIX shell command string、stdin、timeout/output limit | quoted payload 不改变语法；空值/超限/非零退出稳定失败 |
| remote file | `commands.rs`、`remote_files.rs` | 远程路径、归档 root/name、SFTP 本地目标、临时 `.mxpart` | 空路径、`..`、分隔符、根路径和冲突策略不能越界 |
| Docker | `docker_tools.rs`、`remote_exec_pool.rs` | 远程 Docker CLI 参数和 stream id | 所有值引用；不完整结构拒绝；副作用命令不自动重试 |
| WebDAV | `webdav.rs`、`webdav_sync.rs` | HTTP(S) URL path segments、body 上限 | scheme/base path/segment 编码与响应上限保持边界 |
| Tunnel | `tunnels.rs`、`terminal/session.rs` | local/remote/dynamic 字段、SOCKS5 target、端口 | kind-specific validation、协议 parser 拒绝非法目标 |
| cached remote exec | `remote_exec_pool.rs` | connection signature、idle/in-flight 状态 | 配置变化、失败、忙碌 session 不被错误复用或关闭 |

调用链原则：前端只通过 typed wrapper 提交结构化字段；Rust 负责 trim、非空/枚举/范围校验和 saved connection resolution；只有经过验证的数据才能进入 shell quoting、URL segment encoding 或协议 parser。

当前审计已确认的第一批缺口与处理：

| 缺口 | 根因 | 处理 |
|---|---|---|
| MCP script execution 自有 `shell_quote` | 与 remote-file helper 重复实现，后续容易语义漂移 | 复用 `remote_files::quote_posix_shell`，保留命令格式 |
| SFTP 目录 entry 名称可进入相对路径拼接 | `.` / `..` / 分隔符未在 staging path 与本地下载 path 前拒绝 | 新增 `remote_file_download_path_invalid` 边界，远端和本地两侧均锁定 |
| 本地下载路径组件未统一做 Windows 安全处理 | `local_relative_path` 直接 `PathBuf::push` 远端相对路径 | 将既有 sanitizer 移至 remote-files owner 并由 commands 复用，拒绝 dot segment |
| WebDAV remote-root/path segment 可包含 `..` | URL 构造前只做 trim/split，base path 可能被 dot segment 逃逸 | settings 保存和 URL 构造双层拒绝，新增 `webdav_settings_invalid` / `webdav_path_invalid` 回归 |
| MCP `execute_script.args` 原样拼入 remote command | string 参数片段未解析/引用，`$(...)`、`;` 等可改变远端 shell 语义 | 增加受限 shell-word parser，逐词调用共享 quote helper；未闭合 quote/escape 返回 `mcp_script_args_invalid` |

现有实现已覆盖而本批补强的边界：Docker quick-run 参数与结构化空值、network diagnostic Windows/shell payload、MCP 命令空值/根路径/字节上限、Tunnel connection/SOCKS 非法输入、WebDAV 保留字符和响应上限。

## 2. 测试策略

### 2.1 先做纯边界证据

优先使用已有模块内的纯函数和测试 seam，不启动真实 SSH/Docker/WebDAV 服务：

- shell 命令测试检查恶意 payload 被完整包裹/作为 positional argument 传递，不仅检查“字符串包含某段文字”。
- remote-file 测试检查路径、归档名称、下载目标和冲突策略的拒绝/规范化结果。
- Docker 测试检查结构化输入的错误 code、参数引用和 side-effect retry 规则。
- WebDAV 测试检查 URL path 的 segment 编码、base path 不被逃逸、query/fragment 不被继承以及 body 读取上限。
- Tunnel 测试检查 kind 分支、端口范围、SOCKS5 address type/command/method/port。
- Remote exec pool 测试检查 signature、idle timeout 和 in-flight guard；不把它扩展为真实网络生命周期测试。
- MCP script 参数测试检查 shell-like words 被重新引用，原始 `$(...)` / `;` 片段不会成为命令语法，未闭合 quote/escape 会稳定失败。

### 2.2 恶意输入语料

各模块就地使用最小测试值，避免新增共享测试抽象和跨模块耦合。覆盖：

- `value with spaces`、单引号、双引号、反斜杠、换行、`;`, `&&`, `|`, `$()`, 反引号、`*`, `?`、Unicode。
- Windows `C:\Users\Public\file.txt`、UNC 风格 `\\server\share\file` 和 POSIX `/tmp/...`。
- 空白/空字符串、`.`、`..`、包含 `/` 或 `\` 的名称、端口 `0`、越界端口和超长输入。
- 任何 fixture 只使用非敏感、不可用的字面量；不得输出完整 command 到日志。

## 3. 预期最小修复方向

1. 若已有 helper 只缺测试，先补测试，不增加抽象。
2. 若发现不同模块重复实现 shell quoting，优先复用 `remote_files::quote_posix_shell`；只有 Rust 模块可见性或依赖方向不允许时才提取到不含业务语义的共享位置。
3. 若 WebDAV `..` 或 encoded segment 能逃逸配置的 base path，在 `url_for_segments`/segment normalization 单点修复；不要在 UI 端删改片段掩盖问题。
4. 若 remote-file local target 可被 `..` 绕出 download root，在 Rust path resolution 单点拒绝并保留稳定错误码；不要依赖 Windows/Unix 的 `Path::join` 偶然行为。
5. 若 Docker 参数构造存在未引用值，补回共享 quote 并加入包含空格/单引号的精确命令断言；不把参数改成用户可注入的 shell script。
6. MCP 的 legacy string args 不改公共字段类型；在 Rust 内做受限 shell-word 解析并逐项 quote，避免为修复注入问题而引入未经评审的协议迁移。

## 4. 兼容与风险

- 保持现有 command names、request/response 字段和 `AppError` code，除非当前代码已违反本任务的既有 contract。
- 保持远端 POSIX shell 兼容；Windows 只影响本地路径输入和 CI runner，不把 PowerShell 语法送给远端 SSH shell。
- 纯单元测试不能证明远端服务器的 shell、Docker CLI 或 WebDAV server 行为；若没有服务环境，交付记录必须保留 `ENVIRONMENT-BLOCKED`。
- 任何中途发现的生命周期问题移交父任务后续切片，避免把输入边界与资源回收混成不可审查的大提交。

## 5. 回滚

本子任务应保持一个可独立回滚的代码/测试提交。若三平台 CI 或实际协议兼容性失败，回滚本子任务提交，不回滚已经验证的 Batch E、MCP 或 capability 改动。
