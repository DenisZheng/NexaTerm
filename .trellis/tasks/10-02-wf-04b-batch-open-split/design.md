# WF-04B 设计

## Batch owner

新增独立 batch model/controller 边界。ConnectionPane 只产生“对 canonical group 建批次”的用户意图；WorkspaceShell 只复用现有 open/cancel 能力接线，不持有批次规则。

候选 identity 始终是 connection/profile ID；运行成功后返回/追踪新建的 instance ID。批次前已存在的实例单独记录，取消永远不把它们纳入关闭集合。

## 候选顺序

递归按 canonical group sibling `sortOrder` 做 depth-first；同组连接沿当前 repository/list 投影顺序。预览显示完整 group path，跨父同名可区分。

## 限流

- `MAX_NEW_SESSIONS = 20`
- `MAX_CONCURRENT_ATTEMPTS = 4`
- `waiting-user` 计入 active slot，避免 prompt/host-key 在后台无限堆积。
- 不在首版暴露并发滑杆；这是产品保护上限，不是用户性能调优面板。

## 取消

cancel-request：
- queued → cancelled；
- connecting / waiting-user → 返回“本批需要取消”的 attempt/instance token，由现有关闭/取消入口执行；
- success 不变；
- batch 前已存在实例完全不在 cancel plan。

## Split

04B 不建立新布局引擎。继续用 terminal pane binding 与 4-pane reducer/controller；新 UI 只增加“选择已有实例 / 新建实例”的明确语义。批量连接结果不会自动改变 layout。

## 证据

纯 plan/lifecycle 用 unit；ConnectionPane 预览和按钮用组件测试；批次与现有 open/cancel 接线用 integration/source gate；A08 用真实 Tauri。
