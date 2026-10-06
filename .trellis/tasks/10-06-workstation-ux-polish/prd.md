# 主窗口工作流 UX 收口

## 用户流程

用户从 Home 快速连接服务器，在左侧定位已打开实例及其 Files，在 Split / MultiExec 中明确识别输入源和接收目标。

## 依据与边界

- 唯一父任务：`09-23-nexaterm-workflow-mainline`。
- 规范优先级：REQUIREMENTS → WORKFLOW_SPEC v0.6 → ROADMAP → 历史交付计划 → task。
- REQUIREMENTS §20/21/29–31/35/41；交付计划 §3.1–3.5；WS-M01–M05、E01/E03/E04/E07–E13、C03–C06、F01/F05/F06、G01、X01–X09。
- 回归验收：A02、A05/A06、A08、A09/A10；不改 A01–A14 既有 PASS，不关闭 A15。
- 基线：PR #42 OPEN / Draft，HEAD e9a80f7c，CI #542 SUCCESS。UX 分支独立；PR #42 合并后再对齐 main。
- 不碰 PR #12、Rust backend、Split/MultiExec reducer、待确认 WS-F03/N04/R03；不改变临时会话、Files 隔离、广播或关闭语义。
- 本轮已获直接实施与真实 macOS Tauri 启动授权。保持现有视觉、token、Radix/Lucide 与双语 catalog。

## 本轮范围

1. Home 直接 Quick Connect，复用 parser / openQuickConnect；保存会话与本地终端入口清晰区分。
2. Files 持续显示实例标题、地址、状态及 Split pane 归属。
3. Session tree 打开数量及已有实例跳转；单实例直达，多实例显式选择。
4. MultiExec 目标计数、固定集合提示、Split 焦点与输入源呈现。
5. Toolbar 高频排序、Quick Open、按宽度折叠、活动状态；不可用 X11 保留菜单说明。
6. 分组展开标记、批量预览可发现性及 Files 常用动作顺序。

## 验收

- [x] Home 合法地址进入已有临时连接流程；非法地址不运行；临时地址不持久化。
- [x] 树中跳转不创建连接，支持同 profile 多实例及 Split pane。
- [x] Files 标题与实际 stateKey / focused pane 一致，非 SSH 无残留归属。
- [x] MultiExec 焦点变化不改变目标；只投影有效目标，断线不伪装为仍接收。
- [x] TypeScript、build、frontend tests、相关 source gates 通过，启动 chunk 保持轻量。
- [x] Light / Dark / system-dark、English / zh-CN、窄工具栏完成检查；2026-10-06 维护者确认本轮真实 macOS Tauri UX 验收通过，证据边界见 verification.md。

## 独立事项

前轮 WS-F02/R01 恢复补丁在独立 `fix/wf07-files-follow-restore` 工作树，本轮不混入该提交或已暂存的对账文档。
