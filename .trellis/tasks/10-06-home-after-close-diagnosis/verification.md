# Home 空白修复验证

- 分支：`fix/home-after-close-null-connection`。
- 基线：`origin/main @ 17a4365f2ad7a609152d183691925138f602312c`，已 fetch 核对。
- 运行时变更：`WorkspaceShell.isSshConnection` 先确认连接对象存在；保留已有 profile 缺省 SSH 协议兼容。
- 测试：`scripts/workspace-home-close.test.mjs` 执行真实 shell 类型守卫、命令历史派生函数和真实 session controller。假数据不包含真实连接或凭据。

## 自动验证（2026-10-06）

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --test scripts/workspace-home-close.test.mjs`，修复前 | 1 PASS / 4 FAIL：空对象被判 SSH；Local/RDP/VNC 回退均在读取 name 时抛错 |
| 同一命令，修复后 | 5 PASS；包含三类回退过渡帧及全部关闭后 Home |
| 原始诊断 `repro.cjs`，修复后 | 两场景 PASS，无渲染错误，最终均为 Home；已由正式脚本测试替代 |
| `pnpm run check` | PASS，`tsc --noEmit` |
| `pnpm test` | 75 文件；556 PASS / 1 原有 TODO |
| `pnpm run test:scripts` | 115 项；112 PASS / 3 原有 gitleaks 环境 SKIP |
| `node scripts/check-workspace-empty-home-source.mjs` | PASS |
| `node scripts/check-startup-module-boundary-source.mjs` | PASS |
| `pnpm run build` | PASS；Vite 3,416 modules、21.97 秒 |
| 构建产物静态 import 图 | `index-CZvpXB7i.js` 首屏无重型 feature chunk；终端、设置、文件、编辑器独立输出 |
| `git diff --check` | PASS |

命令使用 `pnpm_config_verify_deps_before_run=warn` 复用现有 node_modules 缓存；pnpm 提示工作树结构变化。已逐字节确认本分支 `package.json`、`pnpm-lock.yaml` 与缓存所属根工作树相同，未安装或升级依赖。Vite 仍有既有大 chunk 警告，未调整阈值掩盖。

## 原生启动与人工验收

- 维护者确认后，已停止原故障开发会话 `61577`，从当前独立工作树执行 `pnpm run tauri:dev`。
- 当前启动会话：`62727`，应用 PID `81832`；运行目录为 `/private/tmp/nexaterm-home-after-close-fix`。MCP sidecar 编译 32.04 秒，原生应用编译 29.53 秒，已运行 `target/debug/nexaterm`。
- 2026-10-06 19:25 左右通过已获授权的 AppleScript/截图方式检查：窗口可显示设置页，点击首页后出现完整 Home；快速连接、新建保存会话、本地终端、最近/收藏和连接列表均可见，顶部无会话实例。只验证显示与回首页交互，未替维护者操作真实远端连接。
- 本地现场截图 `/private/tmp/nexaterm-ux-resume.png` 未纳入提交，避免带入真实连接信息。
- Rust 存在原有 15 项 lib unused/dead-code 警告及 1 项 sidecar dead-code 警告；Babel 提示 WorkspaceShell 超过 500KB；未修改这些无关问题。启动仍可见 recoverable `secret_missing`，同时 Home 能正常显示，继续保留独立诊断范围。
- 人工验收待维护者确认：打开一个 SSH 和一个本地终端，活动 SSH 关闭后正常切到本地，再关闭本地后 Home 保持显示且可操作。
- Local/RDP/VNC 回退自动化通过不等于真实远端协议验收。
- 本分支不包含 PR #44 的 Files follow snapshot 补丁。维护者于 2026-10-06 反馈“AB我测完了，OK”，WF-07 A/B 验收已在其任务中记录为 PASS；该反馈不代替本任务仍待确认的真实关闭回归。

## 交付边界

- `secret_missing` 与列表 key 警告未修改，未改 Vault/凭据实现或其它产品功能。
- 维护者于 2026-10-06 授权本地提交；仅提交已核对的目标改动，不推送。构建产物、node_modules、target 与运行时 Trellis 文件不入提交；Home 真实关闭回归仍待确认。
