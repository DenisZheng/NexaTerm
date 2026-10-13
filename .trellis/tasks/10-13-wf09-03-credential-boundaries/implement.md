# 执行

1. 实现可撤销 Vault proxy 与同锁 publish，补锁后旧 handle/换密/失败缓存测试。
2. 凭据删除采用 transaction + secret delete/commit 回滚，测试引用拒绝、secret/SQL 失败与成功。
3. 账号秘密规范化保留原字符；hook 阻止旧列表和不可用 mutation；补实际行为测试。
4. 验证列表/metadata export/snapshot 排除，保留显式加密导出；更新跨层 spec 与集中验收记录。
5. 本地前端与 scripts/type/build/source 检查、敏感 diff 审查后更新 Draft PR #60，Rust 实际结果由新 CI 留证。

## 实现与验证记录（2026-10-13）

- 已实现可撤销 Weak 访问代理；Vault 发布与秘密 I/O 共用访问锁，owner drop/lock/re-unlock/rekey 撤销旧代理。
- 删除采用 SQLite transaction + 多槽位 secret delete/commit 回滚；包含旧认证类型槽位，恢复失败明确报错且不把秘密放入诊断。
- Vault persist 失败恢复缓存；账号密码/私钥口令保持原字符；hook 挂载/可用生命周期与 request revision 阻止迟到响应，同步操作槽阻止重复 native mutation。
- 列表、预览与普通结构化导出排除秘密；显式加密导出格式保持既有契约。
- Vitest：91 文件、718 PASS / 1 既有 todo；新增 useCredentials 实际 hook 行为 9 项通过。
- scripts：168 项，165 PASS / 3 既有环境 skip / 0 FAIL。
- `pnpm check`、生产 Vite build、startup/remote-editor/snapshot/WF-07/i18n/line-budget/source 与 diff 检查通过；既有大 chunk 警告保留。
- Rust 新增 13 项边界/故障注入测试（Vault 6、删除 7），本地缺少 Rust 工具链，未记本地 PASS；新提交的三平台 CI 实际结果在 PR #60 留证。
- 任务进入 review，真实 GUI/Windows/macOS/Linux provider 验收统一后续执行，清单保持 MANUAL_REQUIRED；不宣称跨文件 crash 原子性或历史加密备份安全擦除。
