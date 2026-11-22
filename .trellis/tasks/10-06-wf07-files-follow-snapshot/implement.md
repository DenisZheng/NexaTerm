# 实施顺序

1. [x] 核对 main `17a4365f`、#42/#43 合入及原补丁范围，建立独立分支/工作树与本任务。
2. [x] `git cherry-pick -x aef55f8a1c4345a29a907597ab5f9578e21bd7af`；移植为 `6bfb3a7`，没有冲突，运行时改动仅含原补丁。
3. [x] 检查“开关 → bridge → snapshot → codec → 冷模块/面板恢复”及错误路径；原补丁回归已覆盖本轮范围，无需额外运行时代码。
4. [x] 运行 `npm run check`、全量 `npm test`、`npm run test:scripts`、`npm run build`；运行 workspace snapshot、WF-03、WF-07、i18n、startup 和 line-budget source gates。Rust 三平台测试与安全/许可证检查由 PR CI 执行。
5. [x] 检查差异、敏感内容并创建独立 PR #44；已合入 main（merge commit `9f26add`）。
6. [x] 跟踪当前 PR HEAD 的 CI；run `37460118773` 七个实际执行 job 全部通过。
7. [x] 维护者在 Mac 上按 A=OFF、B=ON 完全退出并冷启动；2026-10-06 确认 PASS。

依赖复用本机已安装且 lockfile 相同的 node_modules，不安装/升级。测试失败先查明确原因；不得删断言、跳用例或混入其它功能。证据记录于 `verification.md`。

## 最终状态（2026-11-22 对账）

WF-07 Files follow snapshot 已由 PR #44 合入 main，任务完成。人工验收结论为 Mac A=OFF/B=ON 完全退出后冷启动仍分别恢复；CI run 37460118773 的七个实际执行 job 全部通过。WS-F03 手动浏览暂停/恢复入口不属于本任务验收范围。
