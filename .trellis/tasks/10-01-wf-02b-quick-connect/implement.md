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
- [x] B1 CI / PR：PR #24，CI #162 全绿。
- [x] B1 真实 SSH smoke（最终 A04 在 B3 一次集中验收；维护者确认 A04 全流程已通过）。

## B2 临时 Files/SFTP

- [x] saved / temporary 统一连接上下文解析。
- [x] remote_file list/read/write/create/rename/delete/transfer 支持 temporary ref。
- [x] temporary release 同步关闭 RemoteFileManager 缓存；独立 SFTP transfer 持有自己的已解析配置，不依赖释放后的 registry。

## B3 保存为会话

- [x] temporary → 正式 prompt profile；临时认证不永久写入 profile。
- [x] 当前终端原地关联新 profile，保留原 sessionId/requestId，不调用 terminalConnect。
- [x] 保存后正式 profile 进入 Sessions；当前实例用内存 alias 延续 Files 认证，关闭实例后释放 alias。
- [x] A04 全流程真实 GUI 验收（维护者于 2026-11-22 再次确认此前 PC 验收通过；详见 validation/a04-real-tauri.md）。


## 2026-11-22 进度对账

WF-02B 的 B1/B2/B3 已随 [PR #24](https://github.com/DenisZheng/NexaTerm/pull/24) 合入 main。维护者明确确认此前已在 PC 完成 A04 全流程真实 GUI 验收，结果 OK；本次仅补齐仓库记录，不声称验收发生在 2026-11-22。原始验收日期和逐步截图未保存在当前仓库，证据边界见 [A04 记录](validation/a04-real-tauri.md)。
