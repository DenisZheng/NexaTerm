# WF-06B 实施切片

## 06B-0 启动
- [x] 从 WF-06A @ e7bf637b9 建 `feat/wf06b-multihop-jump`。
- [x] 对齐 WS-N02 / A12：拒绝嵌套不算多跳完成。
- [x] 选择复用现有递归 profile 引用，不新增 parallel schema。

## 06B-1 connection plan / owner
- [x] 解析最多两级 Jump plan，拒绝 self/cycle/超深/缺节点。
- [x] `Option<SshHandle>` 升级为 jump client chain。
- [x] Terminal / Exec / SFTP / Tunnel 共享同一个 connect_target_client。
- [x] close/failure 释放所有已建立中间 client。
- [x] unit/source gate/CI。

## 06B-2 auth / Host Key / UX
- [ ] 每跳 connect/auth/direct-tcpip 错误定位到具体 connection。
- [ ] prompt credential 能针对具体 jump node 重试。
- [ ] ConnectionDialog 展示实际两级 plan 并阻止明显循环。

## 06B-3 real fixture / A12
- [ ] Docker 两级 Jump → Target 真链路。
- [ ] Terminal + Files(SFTP) 都走同一路由。
- [ ] Tunnel 复用同一 chain。
- [ ] 中间失败/关闭无残留 SSH client/forward。
- [ ] A12 合并 WF-06A Tunnel + WF-06B Jump。

不要修改 `scripts/line-budget.json`。


## 06B-1 实施证据

- 保留既有 `ConnectionJumpConfig`：Target 引用 Jump-1，Jump-1 可继续引用 Jump-2；不新增第二套 schema。
- 新增 `resolve_jump_chain_with`，从 target 向上解析引用并反转成实际建立顺序 `Jump-2 → Jump-1`。当前 v1 上限固定两级；self、cycle、第三层分别返回 `connection_jump_self_reference`、`connection_jump_cycle`、`connection_jump_depth_exceeded`。
- 删除原 `connection_jump_nested_unsupported` 拒绝逻辑；单测明确验证两级 plan 顺序为 `jump-002, jump-001`。
- TerminalSession、ReusableExecSession、ReusableSftpSession、ReusableForwardSession 全部从单个 `Option<SshHandle>` 升级为 `Vec<SshHandle>` owner。
- `connect_target_client` 先依次建立 Jump-2、Jump-1，再从最后一个 jump 打开 direct-tcpip 到 Target；四类 session 继续共用同一函数，因此 Terminal / Exec / Files / Tunnel 不会出现不同路由实现。
- 建链任一阶段失败时会反向 disconnect 已建立的 jump clients；正常 close 也统一反向释放全部 jump clients。
- 本切片暂不宣称每跳错误文本/credential prompt 已完成；这些属于 06B-2。
