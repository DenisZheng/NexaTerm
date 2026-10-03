# WF-05C RDP / VNC capability 与统一入口

> 父任务：`09-23-nexaterm-workflow-mainline`。
> 堆叠基线：WF-05B `bcda79ec181a7135d5fae563e4853e6a5f2f1520`。
> Delivery Plan：RDP/VNC 为 Experimental / non-blocking；真实平台差异必须可见，不能为统一外观伪造同一种能力。

## 用户流程

新建会话 → 明确选择 RDP… / VNC… → 看到当前平台和 runner 能力 → 复用现有 ConnectionDialog 配置 → 打开独立实例 → 关闭标签后释放 embedded host / external process / local bridge。

## 范围

- New Session 增加 RDP… / VNC… 直达入口。
- RDP capability 必须区分 Windows embedded ActiveX 与 external mstsc、Linux FreeRDP、macOS external app。
- VNC 保留内置 noVNC/local bridge；外部 viewer 仅作为可选 runner。
- 缺 runner、unsupported 或 fallback 时显示具体原因，不把“可保存配置”伪装成“当前平台一定能启动”。
- 普通打开可聚焦已有同 profile session；明确 new-instance 路径创建 sibling instance。
- 关闭 RDP/VNC session 必须释放 backend session、process/temp file/bridge，并清理 runner host payload。
- RDP/VNC 不进入 terminal MultiExec target。
- A11 追加 RDP/VNC Phase 3；A09/A10/A11 后续集中真实验收。

## Out of scope

- 不统一 RDP 跨平台嵌入内核。
- 不把 RDP/VNC 伪装成 terminal broadcast target。
- 不把 Experimental 升级为 v1 release blocker。
- 不启动 WF-06。
- 不修改 PR #12 或 `scripts/line-budget.json`。
