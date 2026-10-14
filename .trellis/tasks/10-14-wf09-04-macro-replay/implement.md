# 实施

1. 登记已批准切片、读规范与现有 MultiExec/terminalWrite 通道。
2. 实现不可变预览与可取消串行重放，复用既有投递函数。
3. 共享弹窗壳、按需入口与编辑/预览/结果 UI；补 English/zh-CN。
4. 执行行为测试、类型、构建、scripts/source/line-budget；审查日志/历史/快照边界。
5. 更新 spec 与 MANUAL_REQUIRED 清单，通过 GitHub connector 提交 Draft PR，堆叠 PR #60，不自动合并。

## 验证与边界
- 最终 Vitest：94 文件、736 PASS / 1 既有 todo；本刀新增 18 项实际 engine/Dialog/Launcher 测试。
- scripts：168 项，165 PASS / 3 既有环境 skip / 0 FAIL。
- 类型检查、生产 Vite build 通过；MacroDialog 单独 lazy chunk，约 6.7 kB。既有大 chunk 警告保留。
- startup、WF-04C、i18n、workspace snapshot、WF-07、line-budget、diff/source 检查通过。
- 已复核原生错误不进入结果/日志，宏不调用 history/snippet/storage/snapshot/export；测试均使用合成数据。
- 从 Live 打开宏时先保持工具栏挂载，再停止 Live/Command Sender；关闭所属工具栏卸载并 abort。
- 未修改 Rust；本刀集成 CI 在 Draft PR 留证。基线 542edbd 的 CI #586 全部执行检查已通过，不能替代本刀 CI。
- 真实 GUI、协议与三主题验收后续统一，清单为 MANUAL_REQUIRED。录制/敏感输入遮蔽/持久化留待后续切片，完整 WF-09-04 未完成。
