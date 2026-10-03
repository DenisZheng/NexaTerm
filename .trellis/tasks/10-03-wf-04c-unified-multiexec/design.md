# WF-04C 设计

## 单一 MultiExec owner

现有 `src/features/workspace/multiExec` 成为唯一目标/模式状态 owner。Command Sender 和 Split Sync Input 不再各自维护可漂移的 target 选择。

状态：

```ts
mode: "off" | "live" | "send"
targets: Set<terminalInstanceKey>
error: string | null
```

目标 key 使用既有 pane binding key：
- `ssh:<tabId>`
- `local:<tabId>`

## 固定 targets

只有用户显式勾选/取消才能增加 targets。
运行实例关闭或断线时，availability reconcile 只允许移除不存在/不可写 target；绝不因为焦点、active tab 或重连自动加回。

## live source

source 从当前终端输入事件/焦点上下文派生，不存成 target。
- source 可不在 targets。
- source 在 targets 时，fan-out 排除 source，避免相同输入重复写回。
- 焦点切换只改变 source，不改 targets。
- RDP/VNC/Files 焦点不会产生 live terminal input，因此不修改 targets。

## send

send 从固定 targets 解析当前有效 sessionId，逐项写入并记录 delivery：
- written：PTY/terminal write 已完成；
- failed：写入失败；
- disconnected：target 已不存在或不可写。

不把 written 解释成远端命令执行成功；不自动重试 failed/disconnected/未知结果。

## 兼容迁移

旧 Command Sender 的 connectionId→active tab 自动同步 source gate 将被新 fixed-target source gate 替代，不能通过保留旧行为“兼容”。
