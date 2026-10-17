# Rlogin 配置存储执行证据

范围：独立Rlogin配置、schema5、普通CRUD/复制、旧JSON升级、加密sync/transfer往返。基于PR74文档头7cdeccb5；任务保持in_progress，未合并/发布。前端类型/母版/表单/实际终端入口继续后续；能力标志仍未开启。

## 实现

- 共享BSD/numeric IPv4验证，无外部客户端、网络探测或凭据访问。拒绝SSH认证/代理/跳板/X11及其他协议配置，保存不是连接许可。
- SQLite新增nullable rlogin_json。跨进程稳定文件锁串行备份/检查/升级，VACUUM INTO保持WAL一致性；BEGIN IMMEDIATE原子提交ALTER与版本5。新库跳过备份，已有库保留唯一备份，失败不覆盖。
- 普通Profile与SyncRecord各自追加列；secret SELECT后置列移至29/30。保留既有SSH保存/内联凭据回归。
- 旧可选字段None不进入JSON，冻结非空旧SSH记录验证原字节/digest/AAD兼容；旧transfer1/sync2拒绝Rlogin扩展。验证在导入副作用前执行。
- 修复旧JSON升级遗漏protocol/协议配置的问题，测试Rlogin/Telnet/Serial迁移保留。

## 本地

类型检查、23项source gates、行数门禁与diff检查通过；脚本179通过/3既有环境skip。secrets扫描器和cargo metadata本地缺失，交由完整CI执行。Rust测试尚未执行，本地source通过不替代Rust执行结果。

## CI

首轮CI644的前端/安全/许可证/fixtures通过；Linux557通过/2失败/4既有ignored，macOS558通过/2失败。其一是新夹具错误使用crlf而实际枚举为cr_lf；其二是把一般同步结构校验提前，破坏既有导入失败仍备份的契约。修正夹具，并仅在备份前执行Rlogin安全字段校验，一般结构校验恢复备份后的原位置，保留原断言；新增Rlogin注入必须在备份/替换前拒绝的实际加密导入回归。重新完整CI待执行，不提前标记通过。
