# 验证与交付记录

## 基线与根因

- 基线：`main @ d16610a2c29c8a17027cef5d03ab20b824394a6e`。
- main [CI #551](https://github.com/DenisZheng/NexaTerm/actions/runs/37469120863) 为 SUCCESS，2026-10-07 提交前再次核实。
- 真实 macOS Tauri 诊断为 `body=light`、`app-shell=light`、`native=dark`；亮色半透明面板叠加原生暗色材质形成灰色。原有 body 同步正常，不能归因于 Portal 的 body 值滞留。
- 修复从启动及运行时调用 Tauri `setTheme`，Light/Dark 传对应值，System 传 `null`。主窗口和独立 VNC 窗口共用同步入口，并各自授权最小窗口权限；终端独立配色保持原语义。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| `pnpm run check` | PASS；最终复核修正新增测试的 CSSProperties 自定义属性索引类型错误后重跑 |
| `pnpm test` | 76 文件，566 PASS / 1 既有 TODO |
| document/native appearance 回归 | 6 个用例，覆盖系统深/浅色参数、连续模式切换、body/Portal、原生调用排序、无 Tauri、失败恢复及终端配色独立性 |
| `pnpm run test:scripts` | 112 PASS / 3 既有 gitleaks 环境 SKIP |
| `pnpm run build` | PASS；既有 chunk 体积提示，未新增首屏重模块 |
| `node scripts/check-dark-mode-source.mjs` | PASS |
| `node scripts/check-acrylic-material-source.mjs` | PASS |
| `node scripts/check-startup-module-boundary-source.mjs` | PASS |
| `node scripts/check-tauri-capabilities.mjs` | PASS |
| `git diff --check` | PASS |

原生同步接通前，回归曾因缺少 native 调用失败；接通后通过。mock 回归验证同步契约，不等同于操作系统真实材质渲染验收。

`check-dark-mode-source.mjs` 原有终端方案 hover 断言仍要求旧 `#fbfcfe`，在未修改的 main 工作树同样失败。本次改为断言当前已有的 `color-mix(... var(--mx-panel))`，没有改动 CSS 或终端配色。

## 真实运行与人工边界

- macOS 原生 Tauri 编译并启动成功，维护者确认“已经恢复了”，混色故障人工验收通过。
- 未将该反馈扩大为六格 OS/App 组合、全部 Portal 场景或 Windows/Linux GUI 验收；没有新增协议验收结论。
- 构建、测试日志和诊断图片保存在工作树外，不提交个人数据、调试截图或临时依赖/构建目录。

## 交付约束

维护者已授权独立提交、推送并创建主题修复 PR，禁止自动合并。README 文案可继续，真实截图须等待此修复合入最新 green main 后重新编译拍摄。本修复不涉及 PR #12、A15 发布签名验收或其它功能开发。
