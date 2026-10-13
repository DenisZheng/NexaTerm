# 执行计划

1. 加入实际 hook/计时行为测试，复现旧响应撤销锁定、重复密码提交和超时输入延长锁定。
2. 实现无敏感数据的队列/token、useSecretVault 状态守卫与独立 idle hook，修复主密码 trim。
3. 保留既有 Gate/local 解锁测试，验证重复动作、锁优先、失败重试、后台恢复、StrictMode 和卸载。
4. 运行本地与 CI 等价检查、构建和测试，更新 spec、集中验收记录；通过 GitHub connector 提交独立 Draft PR。
5. 不自动合并，不声明真实 GUI/钥匙串或整个 WF-09-03 PASS。

## 2026-10-13 自动化结果
- 旧实现先复现 4 项失败：重复密码提交、unlock 与 lock 竞争、旧 status 撤销锁定、挂起后过期输入重置 timer。修复后全部 PASS。
- 保留既有 local Gate 测试，并修复 StrictMode configuration reset 导致第二次系统授权；实际 security hook/Gate/idle 合计 29 项通过。
- 全量：90 文件 / 709 Vitest PASS / 1 既有 todo；scripts 168 项，其中 165 PASS / 3 既有环境 skip / 0 FAIL。新增 settings 实际 handler 11 项通过。
- pnpm check 与 Node Vite production build PASS；既有大 chunk 警告不变。startup / remote editor / snapshot / WF-07 / i18n / line-budget / diff checks PASS。
- 不新增 backend/IPC、crypto、依赖、schema 或导出格式；Settings 主密码原样传递，其它凭据规范化留给下一刀。
- 基线 PR #59 @ 5b63cde 的 CI #584 所有执行检查 SUCCESS（三平台 Rust、Frontend、Security、License、fixtures；包装按既有策略 skip）。
- 本刀新 Draft PR 的 CI 尚待提交触发；真实 GUI/系统 provider 按集中验收清单留为 MANUAL_REQUIRED，不称整个 WF-09-03 完成。
