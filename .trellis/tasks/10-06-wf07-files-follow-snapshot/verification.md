# WF-07 实例跟随快照验证

## 候选与兼容性

- 基线：`main @ 17a4365f2ad7a609152d183691925138f602312c`，已含 #42 / #43。
- 分支：`fix/wf07-files-follow-snapshot`。
- 原补丁 `aef55f8a1c4345a29a907597ab5f9578e21bd7af` 通过 `cherry-pick -x` 移植为 `6bfb3a7`；13 个文件，151 行增加 / 16 行删除，没有冲突。
- 保留 #42 的测试 locale 初始化和 #43 的 Files 工具栏 / 实例标题。没有额外修改运行时代码；后续提交仅登记本任务、验证结果及统一人工清单。
- 旧审计工作树中的 ROADMAP、父任务对账和其它任务状态没有带入本分支。

## 本地检查（2026-10-06）

| 命令 | 结果 |
| --- | --- |
| `npm run check` | PASS |
| `npm test` | 75 文件，560 PASS / 1 原有 TODO |
| `npm run test:scripts` | 107 PASS / 3 原有 SKIP；跳过项依赖本机未安装的 gitleaks |
| `npm run build` | PASS，3416 modules，21.43 秒；保留既有大 chunk 警告 |
| `node scripts/check-workspace-snapshot-contract-source.mjs` | PASS |
| `node scripts/check-wf03-left-files-source.mjs` | PASS |
| `node scripts/check-wf07-workspace-restore-source.mjs` | PASS |
| `node scripts/check-i18n-new-entry-source.mjs` | PASS |
| `node scripts/check-startup-module-boundary-source.mjs` | PASS |
| `node scripts/check-line-budget.mjs` | PASS，未放宽预算 |
| `git diff --check 17a4365f..HEAD` | PASS |

TerminalPanel、RemoteFilePanel、SettingsView、Docker、RemoteFileEditor 继续独立分块。依赖使用与主工作树 lockfile 一致的本地 node_modules 软链接，没有安装/升级依赖；软链接和 dist 不提交。

已核对完整数据路径：开关变化发布 bridge revision；既有 lifecycle 重渲染并按内容 debounce；toSnapshot 保存布尔值；codec 丢弃过期实例与非法值；恢复 seed 与组件初始状态按逻辑实例配对。缺失字段兼容旧 V1。Rust 边界使用 `serde_json::Value` 并原样存储 JSON，不需修改后端。

自动化包含同 profile 双实例不同开关的 JSON 往返/冷模块恢复、无目录变化的开关更新，以及缺失字段的组件恢复；这些证据不代替原生退出和冷启动。

## PR / CI 门禁

本记录随独立 PR 交付；远端结论须绑定最终 PR HEAD，不能沿用 #42/#43 的 CI。推送后检查 Frontend、Rust 三平台、fixtures、Security 和 License，全部预期 job 成功后停下。CI 链接与最终状态写入 PR 描述，不通过新增证据提交反复触发 CI。

本地未运行 Rust 编译、未安装 gitleaks；对应检查由当前 PR CI 提供，不声明本地通过。

## Mac 冷启动人工验收：PENDING

1. 在本 PR 对应候选运行真实 NexaTerm，启用已有工作区恢复设置；同一 SSH profile 打开 A、B 两个实例。
2. A 的“跟随终端目录”为 **OFF**，B 为 **ON**。保持目录不变切换 B 的开关并最终设为 ON，等待至少 1 秒完成现有 500ms debounce。
3. 完全退出应用后冷启动，分别检查 A=OFF、B=ON；不能只关闭窗口或依赖进程内 cache。
4. 如启用自动重连，B 收到正常终端目录事件时可跟随；A 不应被 B 的开关或事件改变。

本次不启动 GUI、不修改用户数据库/凭据。维护者确认前不把此项写为 PASS，也不宣布 9-23 已确认范围的运行时开发全部完成。原 A14 历史 PASS 保留；`secret_missing` 及其它暂缓/待产品决策事项不在本 PR 中处理。
