# WF-04C 顶层入口验证（2026-10-04）

状态：**本地实现/自动化已通过；A09/A10 后续真实 Tauri 验收于 2026-10-05 均 PASS。**

2026-10-05 后续更新：维护者已在最终堆叠分支 `feat/wf08e-a15-release-acceptance` @ `332f752a5ecee73db69437764a281c27920ec936` 完成真实 Tauri A09/A10 验收并确认均 PASS；最终结果以 `10-03-wf-04c-unified-multiexec/validation/a09-a10.md` 为准。以下保留 2026-10-04 的历史实现/自动化记录。

## 代码与规范

- 分支：`feat/wf04c-multiexec-entry`，基线 `53eca97`，本次改动尚未提交。
- 交互规范：`docs/WORKFLOW_SPEC.md` v0.6，引用 WS-X03–X08 / WS-R02。
- 顶部 action 经共享执行器打开工作区底栏；目标只投影可输入终端实例，底栏与 Command Sender 共用一个目标集合。
- 除新增轻量组件与派生纯函数外没有新依赖；`WorkspaceShell` 未扩大冻结预算。

## 本地自动化

| 门禁 | 结果 |
| --- | --- |
| 全量 `pnpm test` | 69 文件通过，531 测试通过，1 个既有 todo |
| 最后定向 `pnpm exec vitest run` | 8 文件 / 46 测试通过 |
| `pnpm run check` | 通过 |
| `npm run build` | 通过，3410 模块，约 39.91 秒 |
| WF-04C source gate | 通过，新增顶层策略、adapter、底栏可见性与停止检查 |
| i18n 新入口 source gate | 通过 |
| 启动模块边界 source gate | 通过 |
| 行数预算 | 通过，未修改 `scripts/line-budget.json` |
| Trellis context manifests | 通过，implement / check 各 4 条有效规范引用 |
| 敏感信息工具扫描 | 未完成：提升权限后确认本机缺少 `gitleaks`（`tool_missing`），不能记为 PASS；另行人工审核本轮差异 |

构建保持重模块独立 chunk：App JS 约 1.16 KB；TerminalPanel 约 419 KB、SettingsView 约 99 KB、Docker 约 77 KB、RemoteFileEditor 约 3.74 MB。存在既有大 chunk 警告，未把重模块合回首屏。

## 浏览器 UI 验证

环境：Windows，缓存 Playwright 1.57.0 + Edge headless，Vite `http://127.0.0.1:5522/`；使用 `local-preview-*` 预览实例，不连接真实 PTY。

| 检查 | 观察结果 |
| --- | --- |
| 亮色 / 暗色 / system-dark | 1200×760 窗口截图检查通过，背景/文字/边框随主题 token 变化；system-dark 与显式暗色一致 |
| 最小桌面窗口 | 1100×760，工作区底栏宽 404px，控件换行，无新增水平溢出 |
| 四个同 profile 实例 | 1440×960，按实例序号显示四个目标，选择 A/B 后 C/D 保持未选 |
| 空目标与键盘 | 无终端时顶部入口有禁用原因；未勾选时 Live 禁用；键盘焦点及 Enter 激活有效 |
| 工作区切换 | Live 时切首页仍显示状态与停止，保持 A/B 选择 |
| Send | 从首页激活终端并显示 Command Sender；重复点击保持打开，两个入口共享 A/B |
| 停止与最后目标 | 停止有效；移除 A 后 B 仍 Live，移除 B 后停止并禁用 Live |
| 关闭与重开 | 关闭激活底栏停止 Live；重新打开不恢复广播 |
| 布局与错误 | 底栏按钮均在边界内；无未处理 pageerror |

截图与交互 JSON 仅保存在忽略目录 `.trellis/.runtime/wf04c-browser/`：`light.png`、`dark.png`、`system.png`、`narrow.png`、`four-targets-home.png`、`four-targets-send.png`、`interaction-results.json`。

## 证据边界

- 浏览器预览终端仍会显示既有“尺寸同步失败：缺少 Tauri invoke”提示；这是浏览器无原生后端的限制，没有隐藏提示或伪造写入成功。
- 项目现有主窗口最小宽度为 1100px（`app.css`）；640px 探查会裁切整个窗口，不作为本轮已通过的移动端支持证据。
- 本节的浏览器记录本身不证明真实终端投递；该缺口已在 2026-10-05 的真实 Tauri A09/A10 验收中补齐并记录 PASS。
- 该句描述的是 2026-10-04 当时的历史状态；后续改动已提交并进入 WF-08 堆叠分支，A15 当前已进入真实发布证据阶段。
- 差异人工检查及静态指示符检查未发现新增凭据；文本均为 UTF-8 无 BOM，任务元数据统一为 LF。静态指示符检查不替代缺失的 `gitleaks` 全历史扫描。
- 已用 `pnpm tauri dev` 启动包含本地入口改动的真实桌面开发版（`target/debug/nexaterm.exe`，Vite 5520）。启动时历史恢复项出现 `terminal_x11_prepare_failed` / `remote_exec_connect_refused`，与本机 X11/远端服务环境有关；仅证明窗口启动，不扩展为 A09/A10 通过。

## 后续交付授权

维护者在本地验证后授权提交并推送 `feat/wf04c-multiexec-entry`，明确暂不合主线。当前 `origin` 实际为 GitHub 仓库，远端无 `master`（`git fetch origin master` 返回 remote ref 不存在）；本轮仅推送该现有功能分支，不改远端配置或主线。本节不改变上述验证时点与 A09/A10 待验状态。
