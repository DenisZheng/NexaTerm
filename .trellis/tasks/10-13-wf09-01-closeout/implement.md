# 实施与证据

- [x] 核对 PR #58 @ 5f30fbac 与完整工作区 tree 一致；CI #581 七项执行检查 PASS。
- [x] 读取 Trellis、任务与 WS-M/F、state/component/command/quality 规范。
- [x] 实例归属、关闭确认及异步目标固定，补行为回归。
- [x] 本地导航响应隔离与双向内部拖放，补行为回归。
- [x] 队列暂停/恢复接线与回归。
- [x] 完整 Vitest/type/build/source gates 与 diff 自审；提交使用 GitHub connector，blob/tree 哈希必须逐项一致。
- [ ] 更新 PR 摘要、CI 与人工验收清单。

不自动合并、发布或归档尚未真实验收的任务。

## 2026-10-13 最终本地验证

- `pnpm test`：84 files、654 passed、1 既有 todo。
- `pnpm run test:scripts`：134 tests、131 passed、3 既有环境 skip、0 failed；新增 6 个 shell 实际函数回归全部 PASS。
- `pnpm check`：PASS。
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build`：PASS，startup lazy gate PASS；保留已有大 chunk 提示，不提高阈值。
- remote-file、WF-03 Files、startup、i18n source gates、line-budget、`git diff --check`：PASS。
- 本切片没有 Rust 或依赖变更。本地无 cargo/docker/gitleaks，三平台 Rust、fixture、安全全历史扫描和许可证以本 PR 最新 CI 为准；不能用旧 CI #581 替代本提交。
- 真实桌面/SFTP：见 `validation/manual-acceptance.md`，W09-G01–G09 均 MANUAL_REQUIRED。
- Task 状态为 review：代码就绪，未合并、未进行 GUI sign-off；不归档为整个 WF-09-01 完成。
