# WF-06B 实施切片

## 06B-0 启动
- [x] 从 WF-06A @ e7bf637b9 建 `feat/wf06b-multihop-jump`。
- [x] 对齐 WS-N02 / A12：拒绝嵌套不算多跳完成。
- [x] 选择复用现有递归 profile 引用，不新增 parallel schema。

## 06B-1 connection plan / owner
- [ ] 解析最多两级 Jump plan，拒绝 self/cycle/超深/缺节点。
- [ ] `Option<SshHandle>` 升级为 jump client chain。
- [ ] Terminal / Exec / SFTP / Tunnel 共享同一个 connect_target_client。
- [ ] close/failure 释放所有已建立中间 client。
- [ ] unit/source gate/CI。

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
