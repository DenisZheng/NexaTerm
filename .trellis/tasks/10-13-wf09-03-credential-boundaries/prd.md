# WF-09-03B：凭据删除、访问撤销与秘密排除

用户锁定 Vault 或删除未被连接引用的账号凭据；旧仓库不能继续读取/写入秘密，失败不静默丢失记录，普通列表/结构化导出不携带密码。

父线为 09-23 workflow mainline，按已批准 WF-09-03 规划继续；引用 WS-C06/C07/F05/F08。沿 PR #60 @ c30b2fa（CI #585 全部执行检查 SUCCESS）开发，不改 PR #12/#54/A15，不自动合并。真实 GUI/平台 provider 验收后续统一执行。

## 验收
- W09-03B-01：Vault lock 成功后已发出的 SecretStore/StorageRepository handle 的 get/set/delete 统一返回 vault_locked；重解锁/换密不重新授权旧 handle，新 handle 正常。
- W09-03B-02：锁定/解锁/换密与 secret I/O 共用同一访问锁；已开始秘密操作完成后 lock 才确认。既有 SSH/Files/传输不关闭。
- W09-03B-03：被保存连接引用的 credential 拒绝删除；成功删除记录与对应槽位；秘密删除失败或 SQL 提交失败保留/恢复原记录及秘密，恢复失败明确报错。
- W09-03B-04：Vault persist 失败回滚缓存更改；账号密码与密钥口令原样保存，仅空字符串视为无输入，不改变 metadata 的 trim 或 untouched 语义。
- W09-03B-05：凭据 hook 在锁定/卸载后忽略旧列表/更新回调；成功删除后旧列表不能重新放回记录；不可用期间阻止新 mutation。
- W09-03B-06：列表/元数据导出/快照无秘密值；现有显式密码加密导出与同步格式保留，锁定后旧 handle 不能导出秘密。
- W09-03B-07：自动化/类型/构建/source/line-budget/diff 通过，Rust 由三平台 CI 实际编译与测试。真实 GUI/平台授权为 MANUAL_REQUIRED。

不新增 crypto、依赖、数据库或导出格式。跨 SQLite/Vault 的进程崩溃原子性不在本刀运行时错误回滚承诺内，继续沿用既有加密备份/恢复机制；不把自动化记为真实平台 PASS。
