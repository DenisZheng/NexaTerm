# WF-06A 实施切片

## 06A-0 启动
- [x] 从 WF-05C @ 48579d839 建 `feat/wf06a-tunnel-management`。
- [x] 对齐 WS-N01 / A12，确认 local/remote/dynamic 与既有状态枚举已存在。
- [x] 确认顶部 `tools.tunnels` action 已存在，不重复造入口。

## 06A-1 connection lifecycle
- [ ] backend 增加按 connection 停止全部 tunnel 的 API。
- [ ] 删除 SSH connection 前等待 tunnel cleanup。
- [ ] “关闭该 connection 全部会话”时触发 tunnel cleanup。
- [ ] sibling connection 的 tunnel 不受影响。
- [ ] source gate + CI。

## 06A-2 error/capability
- [ ] 端口冲突错误与 rule 状态关联。
- [ ] credential_required / Host Key 流程回归。
- [ ] rule 与 active/saved connection 展示关联回归。

## 06A-3 A12 tunnel phase
- [ ] local/remote/dynamic 真实 fixture。
- [ ] 关闭/取消后无 listener / remote-forward / SSH resource 残留。
- [ ] A12 tunnel phase 记录，等待 WF-06B 两级 Jump 一起验收。

不要修改 `scripts/line-budget.json`。
