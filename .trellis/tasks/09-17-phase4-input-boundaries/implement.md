# Phase 4：输入边界负向验证实施计划

## 0. 启动前门禁

- [x] 用户确认先做纯函数/契约级负向测试，不把无真实远端服务的结果表述为端到端验收。
- [x] 读取父任务 `prd.md`、`design.md`、`implement.md`，以及 backend/frontend Tauri command contracts 和 shared thinking guides。
- [x] 记录当前分支、父任务基线和工作区状态；不覆盖并行改动。

## 1. 形成边界矩阵

- [x] 盘点 remote exec、remote file、Docker、WebDAV、tunnel、network diagnostic、MCP shell quoting 的请求入口、验证函数、执行 seam 和现有测试。
- [x] 标注每个输入是 shell argument、positional argument、URL segment、protocol field、local `Path` 还是 raw stdin；标出 Windows/POSIX 差异。
- [x] 识别缺失证据和疑似真实缺口；已确认 WebDAV dot segment 与远程目录相对路径存在真实越界风险，先以回归测试锁定再修复。

## 2. 增加负向回归

按模块逐个实施，单个模块通过后再进入下一模块：

1. `remote_files.rs` / `network_tools.rs` / `mcp.rs`：shell quoting、空值、换行、命令替换、Windows/POSIX 路径、命令长度和参数传递。已补测试、统一 MCP quoting helper，并修复 `execute_script.args` 原样拼接问题（受限 parser + 逐项 quote）。
2. `docker_tools.rs` / `remote_exec_pool.rs`：container/image/network/run 参数、空结构、side-effect retry 和 session signature/忙碌保护。已补 Docker 输入边界测试；pool 既有 signature/idle/in-flight 测试保持不变。
3. `webdav.rs` / `webdav_sync.rs`：scheme、base path、`.`/`..` segment、保留字符、query/fragment 和 body 上限。已补 dot segment 拒绝与编码测试，并修复 settings/URL 两层边界。
4. `commands.rs` / `remote_files.rs`：remote path/name、local target、根路径删除、归档 root、冲突策略和 `..` 防越界。已补命令校验测试，并拒绝不安全 SFTP entry、统一本地路径 segment sanitizer。
5. `tunnels.rs`：kind-specific host/port、dynamic normalization、SOCKS5 非法 method/command/address/port。已补 connection、address type 和 zero-port 负向测试。

- [x] 只在测试证明根因后做最小实现修复。
- [x] 每个修复都新增回归测试和稳定错误码断言。
- [x] 不添加 UI 过滤、静默截断、全局 ignore 或与本子任务无关的重构。

## 3. 本地验证

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- [ ] 运行各模块 targeted tests：`remote_files`、`network_tools`、`docker_tools`、`webdav`、`webdav_sync`、`tunnels`、`remote_exec_pool`、`mcp`。
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] 若触及 command registration 或 frontend payload，运行 `pnpm run check` 和对应 source checks。
- [x] `git diff --check`、Trellis context validation 已通过；secret scan 待最终代码暂存后复跑。

当前 Windows 环境记录：已安装自定义 Rust toolchain 的 `rustfmt`，但 `cargo fmt --check` 仍被父分支既有未格式化区域阻塞（`mxterm_mcp.rs`、`app_error.rs`、`mcp.rs` 既有区域、`session.rs`），本批修改的 Rust hunks 已按 rustfmt 输出对齐；`cargo check` 被 MSVC `link.exe`/Windows SDK 环境阻塞。不能将这两项记为通过，最终依靠三平台 CI 验证。

## 4. CI 与环境记录

- [ ] 推送后记录 commit SHA、run URL、Linux/Windows/macOS Rust job 结论。
- [ ] 若无 SSH/Docker/WebDAV 服务，记录对应运行时集成项为 `ENVIRONMENT-BLOCKED`，同时区分纯函数测试 PASS。
- [ ] 不把 cargo test 三平台成功解释为 Tauri GUI、真实远端 shell、Docker daemon 或 WebDAV server 验收。

## 5. 交付与回滚

- [ ] 更新本子任务 `HANDOFF.md` 或验证记录，写明覆盖矩阵、实际修复、未验证环境和回滚点。
- [ ] 经质量检查后创建一个独立英文提交；不 amend，不自动归档父任务。
- [ ] 如需推送，先核对远端分支和提交树，再按用户授权执行。
