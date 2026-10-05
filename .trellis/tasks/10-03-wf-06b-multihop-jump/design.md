# WF-06B 设计

## 连接模型

保留 `ConnectionJumpConfig { kind, jump_connection_id }`。

两级示例：
- Target.jump = Jump-1
- Jump-1.jump = Jump-2
- Jump-2.jump = none

backend 解析为有序 plan：
`[Jump-2, Jump-1]`，再连接 Target。

v1 本切片上限固定为两级 Jump；检测第三层或循环时返回结构化错误，避免递归无界。

## 统一 owner

现有 Terminal / Exec / SFTP / Forward session 都只有 `Option<SshHandle>`。
改为有序 jump client chain，由最终 session owner 持有所有中间 client；关闭时全部 disconnect。

## 分阶段

### 06B-1
- 解析两级 plan；
- self/cycle/depth/missing 校验；
- session owner 从单 jump 改为 chain；
- Terminal/Exec/SFTP/Tunnel 共享 connect_target_client。

### 06B-2
- 每跳认证与 Host Key 错误加 node context；
- prompt credential 对指定 jump node 重试；
- UI 显示实际 Jump-2 → Jump-1 → Target plan。

### 06B-3
- Docker 增加第二个 jump layer；
- 真实两级 Terminal + SFTP；
- Tunnel 通过同一 resolved chain；
- 失败/关闭资源释放；
- A12 合并 Tunnel + Jump。
