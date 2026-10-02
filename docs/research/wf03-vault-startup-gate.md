# WF-03 验收前置阻塞：本机保险库启动恢复

日期：2026-10-02。分支：`feat/wf03a-left-files-view`，修复基线：`87ca9f4`。
继续 `.trellis/tasks/09-23-nexaterm-workflow-mainline` 与既有 WF-03 子任务，不新建任务。

## 复现与根因

用户在真实 Tauri 开发应用中遇到“创建加密保险库”，但从未启用总安全密码，原保存连接此前可以直接连接。

本次只读证据：

- 原 `secrets.enc` 仍存在，617 字节，最后修改于 2026-10-01 18:05:33；仍有 3 个历史临时文件。未读取密钥或解密输出，也未重建保险库。
- 应用日志出现 `vault_local_keychain_unavailable`。单看此错误只能确认系统凭据存储不可用，不能证明密钥丢失或缺少 entitlement。
- 经系统授权执行 `security find-generic-password`（未使用 `-w` / `-g`），确认本机解锁密钥条目存在。
- `securityd` 在 07:23:45 为当前开发程序发起钥匙串授权，在 07:33:01 记录 `user did not approve 'allow'`、`MacOS error: -60008`，随后 ACL 拒绝访问。只能确认授权未完成，不能据此断言用户主动点击拒绝。
- `codesign -dv --verbose=4` 显示当前开发二进制为 ad-hoc 签名，CDHash 与钥匙串原有 ACL 绑定值不同。重新编译后的开发程序触发了新的系统授权；本次没有修改 ACL、签名或系统权限策略。

界面缺陷可以稳定自动化复现：`useSecretVault` 把初始未知状态设为 `initialized: false`，本机自动解锁失败后只更新 error；`SecretVaultGate` 因而把读取/解锁失败解释成“需要创建”。旧界面也没有重试本机自动解锁的入口。

## 最小修复

1. 状态未查询成功使用 `null`；先读取后端状态，再按需要进行本机自动解锁。后端已解锁时复用内存状态。
2. 本机模式失败只显示错误与“重试自动解锁”，不引导用户设置密码；高级保护模式继续使用原密码解锁，状态未知时仅允许重试查询。
3. 重试期间保留门禁并禁止重复提交；StrictMode 不并发触发两次本机授权请求。
4. 复用现有门禁组件、按钮和全局样式；WorkspaceShell 仅增加两个属性连接。未修改 Rust、加密、密钥存储、依赖、Files 策略或 line budget。

`ui-ux-pro-max` 在本机可用技能目录中未找到；本次是已有错误状态与恢复路径的修复，沿用现有组件和 token，没有引入视觉设计或新布局。颜色、材质样式未改；不宣称已完成人工三主题视觉验收。

## 验证

- 新增真实 hook + 组件回归测试，修复前 8 失败 / 1 通过，修复后 9/9 通过；仅 mock Tauri 边界，不访问真实密钥。
- `pnpm run check`：通过。
- `pnpm test`：39 文件，421 项通过、1 项既有 todo。
- `pnpm run test:scripts`：93 项通过、3 项依赖真实 Gitleaks 环境的既有测试跳过。
- `pnpm run build`：通过。TerminalPanel、SettingsView、RemoteFilePanel、RemoteFileEditor 保持独立 chunk；保留既有 chunk 大小提醒。
- `node scripts/check-startup-module-boundary-source.mjs`：通过。
- `node scripts/check-wf03-left-files-source.mjs`：通过。
- `node scripts/check-line-budget.mjs`：通过，预算文件无修改。
- `node --test scripts/vault-local-key-source.test.mjs`：3/3 通过。
- `node scripts/check-settings-page-source.mjs`：失败，旧脚本在 `terminalColorSchemes.ts` 中统计静态配色得到 0，数据已在独立文件中。将检查器及其全部输入从 HEAD 导出至临时目录运行，同样失败，确认是基线问题；本轮未修改无关配色或弱化检查。
- 08:31:40，Vite 日志确认真实 Tauri 应用收到本轮热更新。用户随后明确回复：“已恢复，原连接可直接连接”。该证据确认本机启动与既有凭据连接恢复，不代表 A05/A06 已通过。
- 恢复后再次只读核对：保险库及备份的大小、mtime 未变化，历史临时文件仍为 3 个；本次恢复没有重写原保险库。
- `git diff --check`：通过。

## 后续验收边界

本次启动恢复确认时，远端准备及 A05/A06 尚待验收。随后已确认独立目录就绪、A05 通过；A06 遇到远端缺少 `stat` 的编辑器兼容问题，后续修复与验收状态见 [真实 Tauri 验收记录](./wf03-real-tauri-acceptance.md)。未使用容器，不运行 Docker fixture 清理。WS-F03、WS-F09 保持待确认，不 merge PR #24/#25，不开始 WF-04。
