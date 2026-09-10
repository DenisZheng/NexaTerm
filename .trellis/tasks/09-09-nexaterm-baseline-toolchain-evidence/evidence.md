# Task 00 基线执行记录

日期：2026-09-09  
任务：`.trellis/tasks/09-09-nexaterm-baseline-toolchain-evidence`  
基线 commit：`1ead18f`  
工作分支：`main`

## 工具链

- Node `v22.22.3`、pnpm `11.22.0`、Git `2.54.0.windows.1`。
- Rust 工具链已安装到 `D:\tmp\nexaterm-rust`：cargo/rustc `1.98.1`；cargo-deny 已可用（显式路径运行）。未在 C 盘写入 Rust/Cargo 缓存。
- pnpm 默认 registry 为 `https://registry.npmmirror.com/`；该镜像的 audit endpoint 不可用。
- 使用 `pnpm --registry=https://registry.npmjs.org install --frozen-lockfile` 成功恢复现有依赖；未修改 lockfile。

## 验证结果

| 命令/范围 | 结果 |
| --- | --- |
| `pnpm run check` | 通过 |
| `pnpm run build` | 授权环境通过；Vite 报告若干 >500 kB chunk，但非阻断 |
| `pnpm test` | 命令成功但仍为 no-op，输出 frontend tests not configured yet |
| `node --test scripts/*.test.mjs` | 授权环境 37 tests / 37 pass / 0 fail |
| 逐文件 `node scripts/*.test.mjs` | 7/7 测试文件通过 |
| 全部 `scripts/check-*.mjs` | 50/60 通过，10 个失败 |
| `node scripts/check-startup-module-boundary-source.mjs` | 通过；dist 中 WorkspaceShell、TerminalPanel、RemoteFileEditor、VNC 均为独立 chunk |
| `pnpm --registry=https://registry.npmjs.org audit --json` | exit 1（存在漏洞）；0 critical、5 high、16 moderate、5 low，共 191 dependencies |
| `cargo metadata --manifest-path Cargo.toml --format-version 1 --locked --offline` | 通过；708 个锁定 crate，1 个 crate 未声明许可证 |
| `cargo check --manifest-path Cargo.toml --locked --offline` / `cargo test --workspace --locked --offline` | 环境阻塞；MSVC `link.exe` 不存在。编译仅产生约 0.01 GB D 盘 target 临时文件 |
| `cargo-deny --offline --locked check advisories` | 失败但已获得安全证据：10 个 RustSec advisory（详见 `D:\tmp\nexaterm-baseline\cargo-deny-advisories.log`） |
| `cargo-deny --offline --locked check licenses` | 未作为硬门禁；无 `deny.toml` 时默认拒绝许可证，不能代表项目许可证违规 |
| `cargo audit` | 工具未安装；由 cargo-deny advisories 离线检查提供临时 RustSec 证据 |

## Source check 失败分类

- Rust 工具链阻塞：`check-ironrdp-macos-prototype.mjs`、`check-rdp-release-readiness.mjs`。
- 检查脚本输出路径漂移：`check-connection-quick-search-source.mjs` 假设 tsc 输出在临时目录根，但当前 TypeScript 输出为 `connections/connectionSearch.js`。
- 待修契约/样式基线：AppSelect selected option、Command Sender 激活 tab/历史、Jump source contract、dark-mode hover、global scrollbar token、iTerm2 schemes。
- `check-connection-jump-source.mjs` 的“未来实现缺失”与当前 `terminal/session.rs` 单跳 direct-tcpip 实现不一致，属于脚本漂移，不应据此宣称 Jump 缺失。

完整 source-check 和 npm audit 原始日志保存在本机临时目录 `D:\tmp\nexaterm-baseline\`，未写入仓库。

## 变更边界

本任务没有修改产品源码、依赖声明、lockfile、数据库或运行时配置；仅恢复 ignored 的 node_modules 并更新审计文档/任务记录。未提交、未推送。

## 阻塞与下一步

Rust 依赖图和许可证字段证据已闭合。剩余环境阻塞是 Windows MSVC `link.exe` 缺失；在 C 盘仅约 5.71 GB 可用的情况下，不建议直接安装 Visual Studio Build Tools。后续可选择：

1. 使用已有 Visual Studio/Build Tools 的 Developer PowerShell，设置对应环境后重跑 `cargo check/test`；
2. 将 Rust target 改为 GNU/WSL（需单独确认 Tauri/IronRDP 的平台可用性）；
3. 由独立任务配置 `deny.toml`，再启用许可证/来源门禁。

原始 Rust 日志保存在 `D:\tmp\nexaterm-baseline\`，未写入仓库。
