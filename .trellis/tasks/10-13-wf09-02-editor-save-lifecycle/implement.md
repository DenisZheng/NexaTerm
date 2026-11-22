# 实施

- [x] 读取既有 WF-09-02 规划、WORKFLOW_SPEC 与 Trellis/编辑器状态及 IPC/质量规范。
- [x] 通过 GitHub connector 创建独立堆叠分支，基线 `83db4bf` / tree `e16d7799`，保持 PR #58 独立。
- [x] 先以真实 shell 函数写回归，确认保存内容/重入/迟到回调失败基线。
- [x] 增加纯状态 helper、operation ledger 和关闭/卸载失效接线。
- [x] 运行 focused/full Vitest、脚本、type/build、Files/startup/i18n/line-budget gates。
- [ ] diff 自审、GitHub connector 提交并创建独立 Draft PR，核对 CI。

真实验收留到后续集中执行；不将未验收项写为 PASS，不自动合并或发布。

## 本地验证

- 初始真实 shell 回归：5 FAIL / 1 PASS，确认保存内容误确认、重复写、迟到冲突、读写并发和旧读取覆盖。
- 最终 `pnpm test`：86 files / 668 PASS / 1 既有 todo。
- 最终 `pnpm run test:scripts`：146 tests / 143 PASS / 3 既有环境 skip / 0 FAIL；新增 12 个实际 shell 回归全部 PASS。
- `pnpm check` 与 `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build`：PASS；保留已有 large-chunk 提示，不提高阈值。
- remote-file、WF-03 Files、startup、snapshot、WF-07 restore、i18n source gates、line-budget 与 `git diff --check`：PASS。
- 没有 Rust/依赖变化；三平台 Rust/security/license 以新 PR CI 为准。
- 真实桌面/SFTP：MANUAL_REQUIRED，见 `validation/batched-acceptance.md`，维护者已授权后续集中执行。

## 本地验证

- 初始真实 shell 回归：5 FAIL / 1 PASS，确认保存内容误确认、重复写、迟到冲突、读写并发和旧读取覆盖。
- 最终 `pnpm test`：86 files / 668 PASS / 1 既有 todo。
- 最终 `pnpm run test:scripts`：146 tests / 143 PASS / 3 既有环境 skip / 0 FAIL；新增 12 个实际 shell 回归全部 PASS。
- `pnpm check` 与 `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build`：PASS；保留已有 large-chunk 提示，不提高阈值。
- remote-file、WF-03 Files、startup、snapshot、WF-07 restore、i18n source gates、line-budget 与 `git diff --check`：PASS。
- 没有 Rust/依赖变化；三平台 Rust/security/license 以新 PR CI 为准。
- 真实桌面/SFTP：MANUAL_REQUIRED，见 `validation/batched-acceptance.md`，维护者已授权后续集中执行。
