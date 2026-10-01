# WF-02B 执行记录

## B1 Quick Connect 临时终端

- [x] 创建独立分支 `feat/wf02b1-quick-connect-terminal`。
- [x] 结构化解析 `user@host` / `ssh://user@host:port` / IPv6，并拒绝 URL 密码与非法端口。
- [x] 扩展现有 Quick Open 弹窗为 Quick Connect，同时保留已保存连接搜索。
- [x] 新增 Rust `TemporaryConnectionManager`，不写 connections 数据库。
- [x] 缺用户名/认证时复用现有 ConnectionStep prompt / Host Key 流程。
- [x] 提交凭据后从 running step 清除明文；后续终端连接只传 opaque context ref。
- [x] 临时连接关闭最后一个 tab 时释放 context；认证错误回 prompt。
- [x] parser / Rust context 单测。
- [x] WF-02B source gate 接 CI。
- [ ] B1 CI / PR。
- [ ] B1 真实 SSH smoke（最终 A04 在 B3 一次集中验收）。

## B2 临时 Files/SFTP

- [ ] saved / temporary 统一连接上下文解析。
- [ ] remote_file list/read/write/create/rename/delete/transfer 支持 temporary ref。
- [ ] context 生命周期覆盖活动传输/编辑。

## B3 保存为会话

- [ ] temporary → 正式 profile。
- [ ] 当前终端无重复连接地关联新 profile。
- [ ] 重启后 Sessions 可复用。
- [ ] A04 全流程真实 GUI 验收。
