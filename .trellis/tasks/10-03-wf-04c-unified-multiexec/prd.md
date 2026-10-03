# WF-04C 统一 MultiExec

> 父任务：`09-23-nexaterm-workflow-mainline`。
> 基线：main `e2a8b99f6cc89ae06371e7832cc72136cc637be3`（WF-04B / PR #27 已合并）。

## 用户流程

2/4 Split 或多个已打开终端实例 → 打开 MultiExec → 显式勾选目标实例 → 选择 `live` 或 `send` → 输入/发送 → 查看逐项结果 → 目标断线/重连。

正式验收：**A09 / A10**。

### A09

2/4 分屏 → 选择两个实例 → live/send：
- 两个目标各收到一次；
- 未选实例不收到；
- 切焦点不暗换目标。

### A10

一个广播目标断线，再重连：
- 状态更新；
- 不自动重发未知结果命令；
- 不无提示重新加入广播。

## 已确认规则

- WS-X03：MultiExec 统一为 `off / live / send` 三态；目标以实例 ID 标识，同一 profile 的多个实例可独立选择。
- WS-X04（v0.6）：显式选择后的目标集合固定；焦点变化不改变 targets。断线/关闭目标失效，重连不自动加入。live 输入源可随当前焦点变化，但只改变 source，不改变 targets；source 若也在 targets 中不得重复写回源。
- WS-X05：只允许实际可接受终端输入的 SSH / Local / 已验证 Serial/Telnet 作为目标；RDP/VNC 不作为广播目标。
- WS-X06：live 只存在一个输入来源，避免重复监听/重复写入；断线失效、重连不自动加入。
- WS-X07：send 结果只表示写入成功/失败/目标断线，不声称远端执行成功；不自动重试未知结果。
- WS-X08：终端快捷键/IME/粘贴/Ctrl+C 走明确输入规则；MultiExec 激活时有明显状态和停止入口。

## 范围

### 04C-1 状态模型
把已有 `workspace/multiExec` 从旧 `off/live` 迁移到 `off/live/send`，删除“焦点自动加入 targets”的旧行为。targets 只由显式选择动作改变；可用集合变化只允许移除失效 target。

### 04C-2 实例目标投影
统一 Command Sender 与 Split Sync Input 的 target identity 为 workspace terminal instance key（`ssh:<tabId>` / `local:<tabId>`）。同 profile sibling 独立。

### 04C-3 live
复用已有 terminal input/write 链路；当前焦点仅作为 source。源本身自然接收输入，fan-out 只写其它已选有效 targets，确保一次按键每目标最多一次。

### 04C-4 send
Command Sender 改为消费统一 targets，不再按 connectionId 维护 active-tab target。逐项 delivery 明确 written / failed / disconnected；不自动重发不确定结果。

### 04C-5 A09/A10
真实 Tauri + fixture 验证 2/4 pane、同 profile 两实例、固定目标、live/send 各一次、未选不收、断线失效、重连不自动加入。

## Out of scope

- 不扩展 >4 pane。
- 不把 RDP/VNC 做成终端广播目标。
- 不实现 WF-05 协议平台工作。
- 不改变 Files 跟随规则。
- 不修改或放宽 `scripts/line-budget.json`。
- 不动 PR #12。
