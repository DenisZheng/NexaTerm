# 设计

VaultState 保持既有 key/KDF/文件格式；store 状态锁改为 Arc 共享。发出的访问代理只持状态锁与对应 store 的 Weak 身份，不持强 key/store 引用。每次秘密 I/O 检查当前 store 身份并在持锁期间执行；lock drop 当前 store，解锁/换密替换身份，旧代理永久失效。mutating Vault 方法在同一锁内执行 local/KDF/publish，防止旧存储在新密钥发布后覆盖文件。

SecretStore 增加 object-safe 的 delete-with-commit 默认操作：读取恢复值、删除、调用 SQL commit，commit 失败恢复旧值。生产代理持状态锁覆盖整段操作，lock/换密不能打断恢复。Vault set/delete 的 persist 错误在原 plaintext mutex 内恢复缓存。

credential_delete 抽入小模块，BEGIN IMMEDIATE 后查保存连接引用与原凭据，SQL delete 暂不提交，再删秘密并 commit；失败 transaction 回滚。无 secret 的 metadata-only 凭据直接 commit；缺失槽位可清理，vault_locked 等其它读取错误保持记录。进程崩溃的跨文件提交不宣称原子，不新增持久化 journal。

useCredentials 保留唯一列表，增加启用状态/挂载/request revision 守卫。每次 mutation 使旧 list 失效；操作结束仍只作用于同一可用生命周期。密码/口令保留原字符，metadata 保持 trim；后端也使用相同秘密规则。

普通 metadata/列表与 snapshot 排除测试使用唯一合成 marker；显式加密导出路径原样保留。所有测试无真实凭据或机器路径，人工证据集中补录。
