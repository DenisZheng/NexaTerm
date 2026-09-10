# 安全审查基线

> 本文是静态基线和后续审查计划，不是渗透测试或安全认证。

## 已观察到的控制

| 区域 | 现状 | 评价 |
| --- | --- | --- |
| Secret at rest | `storage_vault.rs` 使用 Argon2id + AES-256-GCM；`secure_bundle.rs` 加密连接传输包 | 基础方案较强，需检查参数升级、rekey、错误和日志 |
| Host key | known_hosts 有 Trusted/Unknown/Changed，session 在连接前校验 | 需验证 changed 拒绝、jump target 和并发更新 |
| Storage migration | JSON→SQLite/Vault 有 backup/journal/rollback | 需做损坏、权限和回滚测试 |
| MCP token | `mcp.rs` 有 token hash/preview 和 token-required 路径；危险命令默认关闭 | 默认 remote bind 仍扩大攻击面 |
| Tunnel validation | local/remote/dynamic 类型和配置校验存在 | bind 地址、DNS、转发权限和 stop cleanup 需实测 |
| Updater | Tauri 配置有 endpoint 和公钥 | 需验证签名轮换、降级和离线失败语义 |

## P0/P1 风险

1. **依赖供应链**：npm 官方 audit 为 5 high、16 moderate、5 low，含 dompurify、postcss、nanoid、browserslist 等路径；须锁定修复版本、评估 transitive 影响并重复审计。Rust 侧已用 cargo-deny 离线 advisory 检查发现 10 个 RustSec advisory；`cargo-audit` 尚未单独安装。
2. **WebView CSP**：`tauri.conf.json` 的 `csp: null`；需先盘点 Monaco/noVNC/inline asset 的实际要求，再收紧 CSP 或写出受控风险接受。
3. **MCP 远程监听**：默认 `0.0.0.0:8765`，即使有 token 也存在扫描、暴力和误配置风险；应默认 loopback 或显式用户确认，并做 rate limit、来源和日志脱敏方案。
4. **错误泄露**：`AppError` 序列化含 `raw_message`，可能把主机路径、命令、连接细节传到 UI/日志；建立安全错误码与可见消息分层，保留诊断关联 ID。
5. **命令/路径边界**：远程 exec、MCP、Docker、WebDAV 和 remote file 路径都需验证注入、目录穿越、shell quoting 和权限；禁止用截断/过滤隐藏异常。
6. **PTY/runner 资源**：线程、子进程、forward channel、websocket 若未在异常和窗口关闭路径清理，会造成泄露或后续会话串扰。
7. **Capability 最小权限**：`capabilities/default.json` 包含 create webview window、窗口操作、dialog、opener/process、clipboard、updater 等宽权限；需按 command/窗口拆分并验证 origin/窗口边界。

## 已执行命令与阻塞

- `pnpm --registry=https://registry.npmjs.org audit --json`：成功取得审计结果但以漏洞 exit 1；不能把 exit 1 当命令失败。
- 默认镜像 audit endpoint 不存在；依赖切换到官方 registry 后 `pnpm run check` 通过，授权环境 `pnpm run build` 通过；受限沙箱的 esbuild `spawn EPERM` 属环境限制。
- `cargo-deny --offline --locked check advisories` 已执行并保存结果；许可证检查因未配置 `deny.toml` 不作为硬门禁。`cargo check/test` 无法执行：2026-09-10 复核确认本机 `link.exe` 与 `cl.exe` 实际存在，真实原因是 VS 2022「使用 C++ 的桌面开发」工作负载半装（缺 `include\` 与 `lib\x64`）且 Windows SDK 未安装；属本机环境问题，不是仓库缺陷，在具备完整工具链的环境中这些命令可正常执行。
- 未进行真实服务器、fuzz、渗透、代码签名或三平台权限测试。

## 后续审查顺序

1. 恢复可重复 Node/Rust 工具链和官方/受信 registry，保存 lockfile 与审计 JSON。
2. 升级/替换可修复依赖，逐项验证 Monaco/noVNC/构建兼容。
3. 做 Tauri capability/CSP/IPC schema review；敏感参数只在 Rust 内处理。
4. 对 Vault、known-host、MCP、tunnel、remote exec、Docker、WebDAV 做负向测试和日志脱敏检查。
5. 运行 secret scanning、SBOM、cargo deny license/advisories、npm audit；在平台 runner 环境复核。
6. 将残余风险按 exploitability、暴露面、可检测性和缓解措施记录，未修复 High 不得进入 release gate。

## 记录要求

安全修复必须记录影响版本、迁移/兼容、回滚方式、测试命令和是否需要用户重新信任 host key 或重新解锁 Vault；禁止提交 token、私钥、真实主机名或审计原始秘密。
