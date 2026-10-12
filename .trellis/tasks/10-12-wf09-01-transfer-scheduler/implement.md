# 实施

- [x] 用户已明确授权开始；读取项目 trellis-before-dev、规范与已有实现。
- [x] 用真实 store + renderHook、mock IPC 写回归，记录失败基线。
- [x] 修改现有 controller 的入队/出队/异常/卸载边界。
- [x] 运行目标测试、全量 Vitest、typecheck、build、传输/startup/line-budget gates。
- [ ] 用 trellis-check 自审，更新证据及相关规范，通过 GitHub connector 提交并建 Draft PR。

验证证据：
- `pnpm exec vitest run src/features/files/useRemoteFileTransferController.test.tsx`：9/9。
- 传输相关 focused suite：4 files、20 tests 全部通过。
- `pnpm test`：80 files、618 passed、1 todo。
- `pnpm check`：通过。
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build`：通过。
- `pnpm run check:line-budget`：通过。
- `check-remote-file-editor-source.mjs`：基线失败，提示现有 same-connection terminal add button 条件，与本切片无关。
- `check:secrets`：浅克隆历史门禁失败（`shallow_history_not_allowed`），未发现具体 secret。

回滚：单独回退本切片 controller 与对应测试；无持久化格式或后端协议变化。
真实 GUI/SFTP 取消/断线验证独立记为待验收，不由 mocked tests 替代。
后续：双栏本地文件视图与现有上传/下载入口接线；实例归属必须单独规划再迁移。
