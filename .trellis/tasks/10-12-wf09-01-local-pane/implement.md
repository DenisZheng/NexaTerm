# 实施

- [x] 创建 Trellis 任务并读取主线、WF-09-01 设计与前端/命令契约规范。
- [x] 增加 typed `local_file_list` command、Rust 实现、命令注册和必要的测试。
- [x] 增加 LocalFilePanel、双栏容器和本地到远程拖放接线。
- [x] 补齐 en/zh-CN i18n、组件测试和 source gate。
- [ ] 运行 focused/full Vitest、typecheck、build、Rust check、line-budget、i18n 和 startup gates。
- [ ] 通过 GitHub connector 推送到现有 WF-09-01 PR #58 并确认 CI。

回滚：回退本切片的本地 command、LocalFilePanel、双栏样式和拖放接线；不改远程文件协议、传输队列状态结构或 workspace snapshot schema。

真实 Windows/macOS/Linux 文件选择和 SSH/SFTP 拖放仍需要维护者在桌面环境人工验收，不能由 jsdom 或 CI 代替。

当前验证证据：
- `pnpm test`：81 files、624 passed、1 todo。
- focused Files/controller suite：3 files、18 tests 全部通过。
- `pnpm check`、i18n source gate、remote-file source gate、startup gate、line-budget、frontend build 均通过。
- 本地 Rust `cargo check` 未执行：当前执行环境没有 cargo；提交后由 GitHub 三平台 CI 验证。
- 本地 secret scan 已补齐完整 Git 历史，但执行环境没有 gitleaks；由 GitHub Security evidence job 验证。
