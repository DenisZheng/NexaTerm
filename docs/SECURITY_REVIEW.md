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

1. **依赖供应链**：npm 官方 audit 为 5 high、16 moderate、5 low，含 dompurify、postcss、nanoid、browserslist 等路径；须锁定修复版本、评估 transitive 影响并重复审计。Rust 侧已用 cargo-deny 离线 advisory 检查发现 10 个 RustSec advisory；`cargo-audit` 尚未单独安装。**Phase 1 复核（2026-09-11）修正了风险画像：5 个 high 全部是 dev-only 构建链依赖、不进发布产物，唯一进生产包的是 dompurify（moderate/low）；Rust 侧 rsa 无修复版、多数 advisory 属 tauri 生态自有。详见下文「Task 01 · Phase 1 审计结果」。** **Phase 2（2026-09-11）：npm 侧已用 `pnpm-workspace.yaml` overrides 清零 high/moderate（仅剩 1 条 dev-only esbuild low），并移除冗余 `package-lock.json`；Rust 锁文件升级待完整工具链环境。详见「Task 01 · Phase 2 执行结果」。**
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
- 2026-09-11（Phase 1）重跑 pnpm audit 与 cargo-deny 并逐条归类，结果见「Task 01 · Phase 1 审计结果」；`cargo audit` 未安装，标记 ENVIRONMENT-BLOCKED，改由 cargo-deny advisories 提供临时 RustSec 证据。

## Task 01 · Phase 1 审计结果（2026-09-11）

> 工具：node v22 / pnpm / cargo 1.98.1 / cargo-deny 0.20.2。依赖清单基线 SHA256 已记录（package.json / pnpm-lock.yaml / package-lock.json / Cargo.toml / Cargo.lock，mtime 2026-09-09）。原始输出保存在 `logs/audit/`（gitignore，命令可复现）。`cargo audit` 未安装 → **ENVIRONMENT-BLOCKED**，暂由 cargo-deny advisories 提供 RustSec 证据（二者不等价，不覆盖 binary 扫描）。

### 1. npm 依赖 advisory 矩阵（pnpm audit，26 条 = 5 high / 16 moderate / 5 low）

关键修正：**5 个 high 全部是 dev-only 构建工具链依赖，不进发布产物**；唯一进生产包（`dev:false`）的是 dompurify（经 monaco-editor 传递），全为 moderate/low 的 XSS/原型污染族。

| 模块 | 条数 | 最高严重度 | 生产/开发 | 传递路径（根） | 修复目标 | 备注 |
|---|---|---|---|---|---|---|
| dompurify | 18 | moderate | **生产** | `. > monaco-editor > dompurify@3.2.7` | ≥3.4.13（覆盖全 18 条） | 唯一 shipped；monaco 固定 dompurify，需 `pnpm.overrides` 顶版或升 monaco，须过 Monaco smoke |
| nanoid | 2 | **high** | 开发 | vite > postcss > nanoid | ≥3.3.18 | DoS；仅构建期 |
| browserslist | 2 | **high** | 开发 | @vitejs/plugin-react > @babel/* > browserslist | ≥4.28.7 | OOM/崩溃；仅构建期 |
| postcss | 2 | high+mod | 开发 | vite > postcss | ≥8.5.23 | 路径遍历读 `.map`；仅构建期 |
| esbuild | 1 | low | 开发 | vite > esbuild | ≥0.28.1 | Windows dev-server 任意文件读；仅构建期 |
| baseline-browser-mapping | 1 | moderate | 开发 | browserslist > baseline-browser-mapping | ≥2.11.0 | 非法输入 DoS；仅构建期 |

- 依赖总数 191（pnpm audit metadata）。生产侧唯一暴露面是 dompurify；实际可利用性取决于是否把攻击者可控 HTML 喂给 monaco 的 sanitizer（Phase 3 评估）。
- 修复策略：dev 链统一升 vite / @vitejs/plugin-react / babel（或 `pnpm.overrides` 精确锁定 nanoid/postcss/browserslist/esbuild/baseline-browser-mapping）；dompurify 用 override 顶到 ≥3.4.13 并验证 monaco 兼容与 `pnpm run build`。

### 2. Rust 依赖 advisory（cargo-deny，10 条 advisory + 3 条 yanked）

`cargo metadata --locked --offline` 通过（依赖图完整）。未配置 `deny.toml`（用默认配置，license/source 门禁不生效，仅评估 advisories）。

| crate@版本 | 类别 | ID | 严重度 | 谁引入（根） | 可修复性 |
|---|---|---|---|---|---|
| h2 0.4.14 | vuln | RUSTSEC-2026-0258 | Low | reqwest > hyper > h2（m-xterm/tauri） | ✅ `cargo update -p h2` → ≥0.4.16 |
| quick-xml 0.39.4 | vuln | RUSTSEC-2026-0194 / 0195 | DoS | plist > tauri；wayland-scanner > arboard（clipboard 插件） | ⚠️ 建议 `cargo update -p quick-xml` → ≥0.41.0，能否升取决于 plist/wayland-scanner semver 约束；构建/配置期解析，运行时无攻击面 |
| rsa 0.10.0-rc.18 | vuln | RUSTSEC-2023-0071 | 时序侧信道 | russh > rsa（及 ssh-key > rsa），根 m-xterm | ❌ **No safe upgrade**；风险接受候选 |
| proc-macro-error 1.0.4 | unmaintained | RUSTSEC-2024-0370 | 构建期 proc-macro | ❌ 无升级；构建期，运行时无面 |
| unic-char-property/-range/-common/-ucd-ident/-ucd-version 0.9.0（5 条） | unmaintained | RUSTSEC-2025-0081 / 0075 / 0080 / 0100 / 0098 | — | urlpattern > tauri-utils > tauri | ❌ 无升级；tauri 生态自有（Unicode 数据表），等 tauri 升级或 urlpattern 迁移 |
| chacha20 / crypto-bigint / der | yanked | — | warning | — | ✅ `cargo update -p <crate>` 可解 |

- **可干净修（lockfile-only）**：h2、3 个 yanked crate。
- **tauri 生态自有、我方无法单独修**：quick-xml、unic-*（等 tauri/plist/urlpattern 上游）。
- **rsa（No safe upgrade）**：经 russh 引入，用于 SSH RSA 密钥操作；advisory 明确 workaround 是"仅在攻击者可观测网络时序时才有风险"。SSH 客户端签名的时序预言暴露远低于服务端解密预言，且可优先使用 Ed25519/ECDSA。**绑定需求 §45 的 russh 升级（P0）**——待 russh 升级到依赖修复版 rsa 时一并解决；在此之前作为显式风险接受（下方风险接受表）。

### 3. 供应链卫生

- **双 lockfile 并存 → 已收敛**：原仓库同时有 `pnpm-lock.yaml` 与 `package-lock.json`；审计与 CI（`release.yml` 用 `pnpm install --frozen-lockfile`）均走 pnpm，`package-lock.json` 冗余且会造成解析差异与审计盲区。**Phase 2（2026-09-11）已移除 `package-lock.json`，确立 pnpm 为唯一包管理器。** 全库核对确认无脚本/CI 读取它（`remoteFileIcons.ts` 的同名条目仅是远程文件浏览器对任意同名文件的通用图标映射，与本仓库 lockfile 无关）。**交接 Task 02**：`LICENSE_AUDIT.md`（§13/§23）原以 package-lock 元数据为 npm 许可证清单基数，Task 02 的 npm 许可证来源需改走 `pnpm licenses list` / `pnpm-lock.yaml`；此方向与 `LICENSE_AUDIT.md` §25「需决定唯一发布安装来源」一致。
- **updater endpoint 指向上游**：`tauri.conf.json` 的更新地址仍是 `github.com/syscryer/mxterm/releases`（非本 fork 自有发布源）。发布前必须改为 NexaTerm 自己的签名发布通道，否则更新会拉到上游产物（信任/供应链问题）。属发布门禁，登记 Phase 5 / Task 08。

### 4. Threat Model（攻击面 → 现状 → 缓解归属）

> 后端错误/日志 spec（`.trellis/spec/backend/error-handling.md`、`logging-guidelines.md`）为空模板；威胁模型以实际代码（`mcp.rs`、`app_error.rs`、`capabilities/default.json`、`tauri.conf.json`）与 `design.md` 为准。

| 攻击面 | 现状风险 | 触发条件 | 缓解归属 |
|---|---|---|---|
| MCP 远程监听 | 默认 `0.0.0.0:8765`，局域网可达 | remote 开启 | Phase 3：默认 loopback + 未确认降级（design §3.1.1） |
| WebView CSP | `csp: null`，无脚本/连接源限制 | 任意注入点（dompurify 绕过、外部导航） | Phase 5：按资源盘点收紧 |
| IPC capability | 19 项权限对 main+runner 一刀切 | runner 窗口被利用则获得多余能力 | Phase 2：按窗口拆分（见 §5） |
| 错误泄露 | `AppError.raw_message` 序列化到 WebView | 任意命令失败 | Phase 3：分类落 code + diagnostic_id + skip_serializing（design §5） |
| 命令/路径注入 | remote exec / Docker / WebDAV / remote file / tunnel 输入边界 | 远程或多目标输入 | Phase 4：结构化参数 + canonicalize + 负向用例 |
| 资源泄露 | PTY / runner / tunnel / websocket / sidecar 异常与关闭清理 | 失败 / 取消 / 窗口关闭 | Phase 4：四类清理路径源码核查 + 运行时验证 |
| 供应链 | 见 §1 / §2 / §3 | 依赖引入 | Phase 2：小批次升级 + 复审 |
| RSA 时序 | rsa 无修复版（见 §2） | 网络可观测时序 + RSA 私钥操作 | russh P0 升级；在此之前风险接受 |

### 5. Capability 使用矩阵（main vs vnc-runner-host）

从前端调用点反推（证据为源码行）：

| 权限 | main | vnc-runner-host | 调用点证据 |
|---|---|---|---|
| core:webview:allow-create-webview-window | ✅ | ❌ | WorkspaceShell.tsx:7292 `new WebviewWindow("vnc-runner-host", …)` |
| core:window:allow-close | ✅ | ✅ | AppTitlebar；VncRunnerWindowApp.tsx:496 |
| core:window:allow-destroy | ✅ | ✅ | VncRunnerWindowApp.tsx:492 |
| core:window:allow-minimize | ✅ | ✅ | AppTitlebar；VncRunnerWindowApp.tsx:511 |
| core:window:allow-toggle-maximize | ✅ | ✅ | AppTitlebar；VncRunnerWindowApp.tsx:513 |
| core:window:allow-start-dragging | ✅ | ✅ | AppTitlebar；VncRunnerWindowApp.tsx:479 |
| core:window:allow-show | ✅ | ？ | 主窗口显示；runner 未见调用 |
| core:window:allow-available-monitors / inner-size / outer-position / set-position / set-size | ✅ | ❌ | windowState.ts（几何恢复，仅 main） |
| dialog:allow-open / allow-save | ✅ | ❌ | shared/tauri/dialog.ts |
| opener:default | ✅ | ❌ | SettingsView.tsx:2/2674；WorkspaceShell.tsx:17 |
| process:default | ✅ | ❌ | shared/tauri/appUpdate.ts:118（relaunch） |
| updater:default | ✅ | ❌ | appUpdate.ts:73（check） |
| clipboard-manager:allow-read-text / write-text | ✅ | ❌ | shared/clipboard.ts |

**结论**：`vnc-runner-host` 实际只需 5 项 window 权限（close / destroy / minimize / toggle-maximize / start-dragging）；其余 14 项（含 create-webview-window、dialog、opener、process、updater、clipboard、几何类）应从 runner 移除。Phase 2 按窗口拆成两个 capability 文件。

### 6. CSP 资源盘点（初盘；Phase 5 收紧前的清单，精确指令须在 dev/build 下验证）

当前 `csp: null`。收紧需覆盖以下已知资源类：

- `script-src`：Tauri IPC、Vite 产物（同源）；Monaco worker（blob: / 同源 worker）。
- `connect-src`：MCP sidecar、noVNC websocket（ws://127.0.0.1:*）、updater endpoint（https github）。
- `style-src`：透明窗口 / 自绘标题栏与 Monaco 可能的 inline style（`'unsafe-inline'` 待证据）。
- `img-src`：连接图标、`data:` URI。
- `font-src`：终端字体（`'self'` + `data:`）。
- `default-src`：收敛为 `'self'`，其余按上表白名单；每个必须保留的 `unsafe-inline` / `data:` / `blob:` 项须在 Phase 5 记录实际调用点。

### 7. 风险接受登记（待 Phase 5 release gate 复核）

| 风险 | 暴露面 | 缓解 | 期限 / 触发解除 | 状态 |
|---|---|---|---|---|
| rsa RUSTSEC-2023-0071 Marvin 时序侧信道 | 仅当攻击者可观测网络时序且使用 RSA 私钥操作；客户端签名暴露低于服务端解密 | 优先 Ed25519/ECDSA；绑定 russh P0 升级 | russh 升级到依赖修复版 rsa 后解除 | 提议接受，待确认 |
| quick-xml / unic-* / proc-macro-error（tauri 生态自有 & 构建期） | 构建/配置期解析或纯构建期 proc-macro，运行时无攻击面 | 跟随 tauri 版本升级 | tauri 升级带入修复版后解除 | 提议接受，待确认 |

## Task 01 · Phase 2 执行结果（2026-09-11）

> 本节记录已在 Windows 基线机完成并验证的低风险硬化批次（Batch A/D）。Rust 锁文件升级（Batch B）、capability 按窗口拆分（Batch C）、静态检查脚本（Batch E）依赖 cargo 编译或 `tauri dev` 运行时验证，记 ENVIRONMENT-BLOCKED，待完整工具链环境执行，不在此声称通过。

### Batch A：npm 依赖 override 升级（已验证）

- **配置位置修正**：pnpm 11.22.0 已不再读取 `package.json` 的 `pnpm.overrides` 字段（install 时报 `WARN … "pnpm" field … no longer read` 并忽略）；overrides 现为 `pnpm-workspace.yaml` 顶层字段（官方文档 https://pnpm.io/settings/dependency-resolution ）。已改放至此，仓库既有的 `allowBuilds` / `onlyBuiltDependencies` 也是同一模式。
- **override 集合**（下限即修复版；lockfile 记录实际解析版本，兼顾"下限达标"与"可复现"）：

  | 包 | 原解析 | override 下限 | 实际解析 | 清除的 advisory |
  |---|---|---|---|---|
  | dompurify | 3.2.7 | ^3.4.13 | 3.4.15 | 18 条（唯一进生产包） |
  | nanoid | 3.3.12 | ^3.3.18 | 3.3.18 | 2 high（dev） |
  | postcss | 8.5.15 | ^8.5.23 | 8.5.28 | high+mod（dev） |
  | browserslist | 4.28.2 | ^4.28.7 | 4.28.9 | 2 high（dev） |
  | baseline-browser-mapping | 2.10.33 | ^2.11.0 | 2.11.21 | 1 mod（dev） |

- **验证链**：`pnpm install`（Packages +9 -9）→ `pnpm run check` exit 0 → `pnpm run build` exit 0（3.7MB `RemoteFileEditor`/Monaco chunk 正常产出，dompurify 顶版不破坏构建）→ `pnpm audit`：**high 5→0、moderate 16→0、critical 0**。
- **残留**：仅 1 条 esbuild low（RUSTSEC 无关；dev-server-on-Windows 任意文件读，dev-only，经 vite 传递）。**有意推迟**：esbuild 与 vite 的 API 强耦合，强升 ≥0.28.1 有破坏 build 风险，且属 low + 仅构建期；留待 vite 升级带入修复版，或作为 dev-only low 显式接受。
- **回滚**：还原 `pnpm-workspace.yaml` 的 `overrides` 块并 `pnpm install` 即恢复原解析；`package.json` 本批净零变更。

### Batch D：移除冗余 package-lock.json（已完成）

见 §3。CI 与审计均走 pnpm；全库核对无脚本/CI 依赖；Task 02 许可证源交接已记录。

### 延后批次（ENVIRONMENT-BLOCKED / 后续阶段）

- **Batch B（Rust 锁文件升级）**：`cargo update -p h2 -p chacha20 -p crypto-bigint -p der` 可干净修 h2（RUSTSEC-2026-0258）+ 3 个 yanked crate；需 `cargo check` / `cargo test` 验证，本机 MSVC C++ 工作负载 / Windows SDK 不完整 → ENVIRONMENT-BLOCKED。
- **Batch C（capability 按窗口拆分）**：按 §5 矩阵拆成 main（全权限）+ vnc-runner-host（仅 close / destroy / minimize / toggle-maximize / start-dragging 5 项 window 权限）两份 capability 文件；需 `tauri dev` 验证 runner 窗口功能不回归 → 待工具链环境。
- **Batch E（静态检查脚本）**：`scripts/check-*.mjs` 断言 capability 无冗余权限、CSP 非 `null`、白名单条目有调用点注释；其断言依赖 Batch C 与 Phase 5 的结果落地，故随 C / Phase 5 一并完成，避免提交即失败的 check。

## 后续审查顺序

1. 恢复可重复 Node/Rust 工具链和官方/受信 registry，保存 lockfile 与审计 JSON。
2. 升级/替换可修复依赖，逐项验证 Monaco/noVNC/构建兼容。
3. 做 Tauri capability/CSP/IPC schema review；敏感参数只在 Rust 内处理。
4. 对 Vault、known-host、MCP、tunnel、remote exec、Docker、WebDAV 做负向测试和日志脱敏检查。
5. 运行 secret scanning、SBOM、cargo deny license/advisories、npm audit；在平台 runner 环境复核。
6. 将残余风险按 exploitability、暴露面、可检测性和缓解措施记录，未修复 High 不得进入 release gate。

## 记录要求

安全修复必须记录影响版本、迁移/兼容、回滚方式、测试命令和是否需要用户重新信任 host key 或重新解锁 Vault；禁止提交 token、私钥、真实主机名或审计原始秘密。
