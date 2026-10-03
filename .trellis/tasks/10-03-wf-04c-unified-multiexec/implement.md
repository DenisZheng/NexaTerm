# WF-04C 实施切片

## 04C-0 启动
- [x] 从 main @ e2a8b99 建 `feat/wf04c-unified-multiexec`。
- [x] 读取 9-23 mainline、WORKFLOW_SPEC、旧 Command Sender / Sync Input 与已有 `workspace/multiExec`。
- [x] 维护者确认 WS-X04；WORKFLOW_SPEC 升 v0.6。

## 04C-1 状态模型
- [ ] `off/live/send` 三态。
- [ ] targets 显式选择后固定。
- [ ] availability 只收缩，不因焦点自动加 target。
- [ ] 断线 target 失效；重连同 profile 新实例不自动加入。
- [ ] source 与 targets 分离测试。

## 04C-2 目标投影
- [ ] SSH / Local / 已验证 Telnet/Serial 实例级 target。
- [ ] 同 profile sibling 可同时选择。
- [ ] RDP/VNC 不进入 terminal target 列表。
- [ ] 删除 Command Sender connectionId→active-tab target owner。

## 04C-3 live
- [ ] 单一 source 输入链路。
- [ ] source 在 targets 时不重复写回。
- [ ] 每目标每次输入最多写一次。
- [ ] 目标断线立即失效并更新 UI。

## 04C-4 send
- [ ] Command Sender 使用统一 targets。
- [ ] written / failed / disconnected 逐项目标结果。
- [ ] 未知结果不自动重发。
- [ ] history/snippets 继续复用，不扩范围。

## 04C-5 A09/A10
- [ ] 自动化边界覆盖。
- [ ] 真实 Tauri A09。
- [ ] 真实 Tauri A10。
- [ ] Draft PR；全绿 + 实测通过后等待维护者授权 merge。

每个切片：定向测试 → 相关全量 → source gate → line budget → commit → push → CI。不要修改 line-budget.json。
