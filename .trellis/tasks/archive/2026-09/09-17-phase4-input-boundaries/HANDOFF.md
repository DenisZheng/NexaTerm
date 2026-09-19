# Phase 4 输入边界负向验证 · 交接

> 更新时间：2026-09-17 ｜ 最终代码提交 `5560b840180c0ab57753942522bc486d59e51482` ｜ CI run `35179534117` 全绿

## 当前结果

第一切片采用已确认的“纯函数 / 命令构造 / 请求校验契约测试”策略，不搭建真实 SSH、Docker、WebDAV 服务。

已完成并经 Rust 三平台 CI 验证：

- MCP `execute_script.args` 在上传前解析为 shell-like words，逐项使用共享 `quote_posix_shell`；非法可选 JSON 类型、未闭合 quote/escape 均返回稳定错误，不再原样拼入远端命令。
- SFTP 远程目录条目拒绝 `.`、`..`、路径分隔符和 NUL；本地下载相对路径复用统一 Windows segment sanitizer，拒绝 dot segment，返回 `remote_file_download_path_invalid`。
- WebDAV settings 和 URL 构造拒绝 `.` / `..` path segments，防止配置 base path 被逃逸；保留既有 Windows separator normalization、query/fragment 清理和响应大小上限。
- Docker quick-run 参数、network diagnostic targets、MCP command/path、tunnel connection/SOCKS 非法输入均有负向回归。
- `mcp.rs` 的独立 shell quote helper 删除，改用 `remote_files::quote_posix_shell`，避免两个实现漂移。

## 验证证据

- 最终 commit：`5560b840180c0ab57753942522bc486d59e51482`。
- Run：<https://github.com/DenisZheng/NexaTerm/actions/runs/35179534117>，结论 `success`。
- `Frontend checks`：success。
- Rust：`linux-x64` 297 passed、`macos-arm64` 297 passed、`windows-x64` 301 passed；0 failed、0 ignored。
- `Security evidence`：success；真实安全测试 13/13 PASS、0 skipped；Gitleaks tracked-tree/history PASS；三个审计 artifact 上传成功。
- 最终 artifact：`security-evidence-5560b840180c0ab57753942522bc486d59e51482`，仅有 `secrets.json`、`npm.json`、`rust.json`，报告 schema/commit/脱敏字段已核验。
- 本机 `pnpm run check`、JS 55/55、最终 secret scan（819 tracked files、220 history commits、0 unreviewed findings）、Trellis context 和 staged diff 检查均通过。

## 尚未完成 / 环境边界

- 全量 `cargo fmt --check` 仍被父分支既有格式漂移阻塞；本批修改 hunk 已按 rustfmt 输出对齐，未借机重排无关文件。
- 没有真实 SSH server、Docker daemon 或 WebDAV server；运行时端到端行为保留为 `ENVIRONMENT-BLOCKED`，纯契约测试不等于远端运行时验收。
- 父任务后续仍需处理 PTY/runner/tunnel/websocket/MCP sidecar 生命周期、真实 Tauri GUI runner、CSP、IPC/origin 负向验证和 dependency advisory 评估。
- 2026-09-19：全量 rustfmt 漂移已于 `eacca4d` 清除；父任务 Task 01 已经 owner 同意归档（`254e830`），本子任务随之归档，真实服务环境阻塞项并入父任务归档说明。
