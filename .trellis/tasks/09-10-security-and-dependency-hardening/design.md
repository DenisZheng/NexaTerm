# Task 01：安全与依赖硬化技术设计

## 1. 设计目标

以现有 Rust/Tauri + React 架构为边界，沿供应链、IPC capability、MCP service、输入验证、错误/日志和资源生命周期六条路径建立可审计的安全控制。设计优先复用现有 `AppError`、Vault、known-host、MCP token 和 validation helper，不引入新的协议栈或秘密存储格式。

## 2. 边界与所有权

| 边界 | 所有权 | 设计原则 |
| --- | --- | --- |
| npm/Rust 依赖 | package manifests、lockfiles、audit evidence | 小批次升级，锁文件为事实来源，升级前后都要审计 |
| Tauri capability | `src-tauri/capabilities/*.json`、`tauri.conf.json` | capability 按窗口/用途最小化，默认拒绝未列出的能力 |
| MCP service | `src-tauri/src/mcp.rs` 及其调用边界 | 认证、暴露范围、命令策略和限流在 Rust 内完成，UI 仅显示状态 |
| 错误/日志 | `app_error.rs`、command 边界、logging helpers | 安全消息与内部诊断分层，敏感值只进受控诊断上下文 |
| 文件/命令输入 | remote exec、Docker、WebDAV、remote file、tunnel | 结构化参数优先，路径 canonicalize/allowlist，禁止拼接 shell 命令 |
| 生命周期 | PTY、runner、tunnel、websocket、sidecar/window | 所有 owner 都有正常、失败、取消、关闭四类清理路径 |

## 3. MCP 远程服务设计

### 3.1 配置状态

- `remote_enabled=false` 继续作为总开关。
- `remote_host` 默认值固定为 `127.0.0.1`。
- 非 loopback host 需要保存显式启用意图/确认状态，不能仅靠文本地址推断用户同意。
- token 只保存 hash/preview；新 token 只在生成动作的受控返回值中出现一次，日志和状态接口只返回 preview。
- `allow_dangerous_commands` 默认 false，危险命令检测与 preview/confirm 语义保持在后端。

### 3.2 请求处理

1. 解析请求并限制 body、命令长度、输出长度和并发数。
2. 在任何连接查找、secret 解析或执行前完成认证和暴露范围检查。
3. 通过结构化参数调用现有 command/service；禁止把用户输入拼成 shell 解释器脚本。
4. 对危险命令返回稳定拒绝码和 reason，不执行、不把完整敏感命令写入日志。
5. 通过 request/diagnostic ID 串起审计日志；响应只返回允许的 DTO 字段。
6. 请求完成、失败、取消或客户端断开时释放 stream、child process、PTY 和 semaphore permit。

### 3.3 速率与来源

- 先采用进程内 token/IP 维度的固定窗口或 token bucket；容量、窗口和惩罚结果写入配置/测试，不在 UI 中硬编码。
- loopback 与非 loopback 使用不同的默认限制；非 loopback 需要更严格并发和失败退避。
- 不把 CORS/来源检查当作认证替代；来源检查只作为浏览器误调用的附加缓解。

## 4. Capability 与 CSP

- 先从前端调用点和窗口创建点生成权限矩阵：`main`、`vnc-runner-host` 分开核对。
- 将仅主窗口需要的 dialog、clipboard、process、updater 与 runner 窗口隔离；create/destroy window 只保留给实际拥有者。
- 对 `opener`、外部导航和动态 webview 做显式 origin/URL 约束。
- CSP 采用盘点后最小集合；至少明确 `default-src`、`connect-src`、`img-src`、`style-src`、`font-src`、`script-src` 和 websocket/noVNC 需求。若必须保留 `unsafe-inline` 或 data/blob，应记录每一项的实际调用点。
- CSP 改动必须配合 dev/build 资源加载验证，避免以放宽 CSP 消除回归。

## 5. AppError 与日志契约

建议保持兼容字段一段迁移期，但将 `raw_message` 从默认前端语义降级为受控诊断字段：

- `code`：稳定、可测试、不可包含动态 secret。
- `message`：面向用户的安全文案，不拼接原始错误。
- `raw_message`：仅在开发/受控诊断通道可见；生产 command response 不返回，或改为脱敏摘要。
- `diagnostic_id`：随机关联 ID，用于查找内部日志。
- `recoverable`：只表达是否可重试/需要用户操作，不表达内部异常细节。

迁移时要检查 TypeScript DTO、Rust command contract 和所有调用方，避免删除字段后出现假成功或通用错误吞掉具体失败。

## 6. 输入验证与资源生命周期

- 路径：拒绝 NUL、相对穿越、未授权根目录和符号链接逃逸；远程路径与本地路径分别验证，不能共用“字符串替换”清理。
- shell：优先 argv/结构化执行；无法避免 shell 时按平台使用明确 quoting helper，并用 Windows PowerShell/CMD、POSIX sh 各自测试。
- Docker/WebDAV：URL、socket、认证 header、上传目标和重定向分别校验；不得把 token 写入 URL 或日志。
- tunnel/forward：bind host、端口、目标 host、stop/restart 和连接断开都要有权限及清理测试。
- PTY/runner/websocket/sidecar：owner drop、join/kill、close channel 和窗口销毁必须幂等；异常路径不得留下后台进程。

## 7. 兼容、迁移与回滚

- 不修改 Vault 密文格式和 host key 数据；依赖升级先做读取/连接 smoke test。
- MCP 配置旧值继续可解析；默认值变化要在设置迁移或状态提示中可见。
- AppError schema 先兼容旧客户端，再移除/隐藏 raw 字段；任何 schema 变更都必须更新 contract tests。
- 每批依赖/配置变更单独提交，保留前一批 lockfile 和可恢复构建证据；安全修复失败时回滚该批，不回滚无关业务改动。

## 8. 风险取舍

- Loopback 默认会增加远程使用配置成本，但显著降低局域网误暴露风险，符合已确认的安全默认值原则。
- CSP 收紧可能影响 Monaco/noVNC/更新器加载；应先证据化实际需求，不能盲目加白名单。
- raw_message 完全删除会损害诊断；分层和 diagnostic ID 能在不把敏感细节送到前端的情况下保留可追踪性。
