# WF-04B 批量打开与分屏

> 父任务：`09-23-nexaterm-workflow-mainline`。继续 2026-09-23 workflow mainline，不建立新路线。
> 基线：main `df43640850fd9056676af472be6b8f1444ad80d0`（WF-04A / PR #26 已合并）。

## 用户流程

会话树分组 → “连接全部…” → 预览/选择 → 有限并发打开 → 查看逐项结果/取消剩余/重试失败 → 显式把已打开实例或新实例放入现有 2/4 pane Split。

正式验收：**A08**。

> 对含成功与失败项的文件夹“连接全部”：逐项结果可见，取消/失败不误关原有会话。

## 规范

- WS-X01：沿用现有 2/4 pane、横/纵、拖动比例，最大 4 pane。
- WS-X02：区分“把已打开实例放入 pane”和“为 pane 新建实例”；一次命令焦点目标唯一。
- WS-X09（v0.5 已确认）：连接全部先预览，默认递归但可关闭；单批最多 20 个新会话，同时最多 4 个未完成启动项；已打开 profile 默认跳过；逐项状态；取消只处理本批未完成项；失败不回滚成功；可仅重试失败；批量完成不自动改变 Split。
- WS-M01/M02：profile 与运行实例分离；取消或批量失败不得误关批次前已有实例。

## UX 决策

1. 自定义 canonical 分组的上下文菜单提供“连接全部…”；固定“最近/收藏”不是 canonical 分组，不在本包新增批量入口。
2. 预览默认包含当前组及 descendants；显示“包含子组”开关。
3. 默认选择尚未打开的候选；同 profile 已有 running/connecting 实例时默认不选择，用户可显式选择以新建重复实例。
4. 单批最多选择 20 个新实例；超过时在预览中明确限制，不静默全开。
5. 最多 4 个 started-but-unfinished 项（connecting / waiting-user）同时存在；等待用户输入的项占用槽位，避免继续堆积交互提示。
6. 状态：queued / connecting / waiting-user / success / failed / cancelled。
7. “取消剩余”取消 queued，并请求取消本批 connecting/waiting-user；已 success 以及批次前已有会话保留。
8. 失败项可单独或整体重试；重试只创建新的一次 attempt，不对成功项重放。
9. Batch 不自动进入 Split。完成后 Split 仍由用户显式选 2/4 pane 和实例。

## 范围

### 04B-1 Batch plan / lifecycle
纯模型收集 canonical group targets、递归/路径、默认选择、20 上限、4 并发、状态与取消/重试；不在 WorkspaceShell 建第二套状态机。

### 04B-2 Tree preview / orchestration
ConnectionPane 分组入口、预览、逐项批次状态；复用现有 per-profile open/connect/credential/host-key 路径，不复制 SSH 认证实现。

### 04B-3 Split instance placement
复用 `workspace/split`、`TerminalSplitSurface`、`TerminalSplitMenu`。修正仍以 connection/local host 为锚的遗留边界，使 pane 选择明确基于实例 binding；支持已有实例与显式新建实例，不扩大 4 pane。

### 04B-4 A08
真实 Tauri：构造同一组至少 3 项（成功、失败/取消混合），证明逐项结果、有限并发、取消剩余不误关原有会话。Split 做 2/4 pane 与已打开/新建实例的真实 GUI smoke；A09/A10 留给 04C。

## Out of scope

- MultiExec off/live/send 与目标集合：WF-04C。
- WS-X04：仍待确认，不在本任务决定。
- 任意层数 Split / >4 pane。
- 重写 RDP/VNC 引擎。
- PR #12。
- 修改或放宽 `scripts/line-budget.json`。
