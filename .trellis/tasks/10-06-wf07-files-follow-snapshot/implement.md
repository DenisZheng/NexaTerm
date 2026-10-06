# 实施顺序

1. [x] 核对 main `17a4365f`、#42/#43 合入及原补丁范围，建立独立分支/工作树与本任务。
2. [x] `git cherry-pick -x aef55f8a1c4345a29a907597ab5f9578e21bd7af`；移植为 `6bfb3a7`，没有冲突，运行时改动仅含原补丁。
3. [x] 检查“开关 → bridge → snapshot → codec → 冷模块/面板恢复”及错误路径；原补丁回归已覆盖本轮范围，无需额外运行时代码。
4. [x] 运行 `npm run check`、全量 `npm test`、`npm run test:scripts`、`npm run build`；运行 workspace snapshot、WF-03、WF-07、i18n、startup 和 line-budget source gates。Rust 三平台测试与安全/许可证检查由 PR CI 执行。
5. [ ] 检查差异、敏感内容、暂存文件；提交本任务记录与必要兼容修正，推送目标分支并创建以 main 为目标的独立 PR。
6. [ ] 跟踪当前 PR HEAD 的全部 CI；绿色后记录结果并停下，不合并、不自动启动后续诊断。
7. [ ] 维护者在 Mac 上按 A=OFF、B=ON → 完全退出 → 冷启动清单验收。该项通过前不宣布 9-23 运行时开发完成。

依赖复用本机已安装且 lockfile 相同的 node_modules，不安装/升级。测试失败先查明确原因；不得删断言、跳用例或混入其它功能。证据记录于 `verification.md`。
