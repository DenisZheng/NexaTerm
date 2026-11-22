# 执行与验证

1. 添加 create-only Rust builder/service/command 注册、TS input/wrapper 与契约。
2. 复用 A 切片 operation/ref/savedContent，接入另存为按钮/快捷键、命名弹窗和成功迁移。
3. 验证取消/非法名称/目标占用、在途编辑/重复提交、失败重试、关闭/重开与卸载；真实 shell 覆盖文件/目录/悬空链接和竞争创建。
4. 执行 check/build/Vitest/scripts 与 remote editor/startup/i18n/line-budget/source 门禁；检查 diff 与敏感信息，更新 Draft PR #59。
5. 真实 GUI/SFTP 验收统一留在 validation/batched-acceptance.md，不能把自动化测试记为人工 PASS。

## 2026-10-13 实现结果
- 同目录 create-only Save As 已实现，复用工具栏/Radix 命名弹窗。取消、重名、操作锁、失败换名重试、源标签生命周期和在途编辑保护均接入真实 controller。
- 成功同步 retarget source id/path/name/metadata 与有条件的活动/unified 指针；保留原文件。新建目标 metadata 失败明确提示已创建。
- 将保存 Rust builder/service 和新 IPC 放入小模块，命名表单抽入 shared TextInputDialog；WorkspaceShell 行数减少，冻结预算不变。
- pnpm check PASS；Node Vite production build PASS（既有 >500 kB chunk 警告保留）。
- 全量 Vitest：88 文件 PASS，689 测试 PASS / 1 既有 todo；全量 scripts：154 PASS / 3 既有环境 skip / 0 FAIL。另存为 hook 19、命名弹窗 2、实际 shell/IPC 11 项；A 保存生命周期 12 项回归通过。
- remote editor / startup / WF-03 / snapshot / WF-07 / i18n / line-budget / diff checks PASS。
- 本地无 Rust toolchain，新增 Rust command/builder/unit test 由 GitHub 三平台 CI 编译验证；不能称 Rust 本地 PASS。
- 人工 GUI/SFTP 为 MANUAL_REQUIRED；保存后 GUI 状态、目标 host 的 link/hardlink 支持、真实断线/权限与主题验收待统一补证。
