# 实施

1. 衔接 A 基线与规范，登记 B 边界。
2. 共享轻量 limits/敏感策略；实现有界 recorder、generation ticket 和有序成功入稿。
3. 原 Sender handler 接 producer，与 UI 开始/停止/编辑闭环；未补填 masked 不准预览。
4. 模型、UI、真实 handler 的成功/失败/迟到/敏感/源替换/cleanup 回归；全量类型/构建/tests/scripts/source。
5. 更新 spec、MANUAL_REQUIRED 清单和 Draft PR #61；原样验证远端 blob/tree，集成 CI 留证，不自动合并。

## 实现与验证记录
- 有界内存 recorder、提交顺序 ticket/generation、固定源与成功后入稿已接入真实 Sender handler；源成功不等待其它广播接收者。
- 已知敏感/认证提示模式在提交前暂停，空 masked 占位仅在源写入成功后入稿；停止后重新编辑/删除占位，仍须预览目标。
- 复现认证回答自动历史遗漏（原回归 1 FAIL），加入 scoped history latch、提交时决策及 TerminalPanel 入缓冲/回调双守卫后通过；终端输入不被吞掉。
- 本刀新增 56 项前端/策略/模型/UI 测试；全量 97 文件、792 PASS / 1 既有 todo。
- 真实 Sender 与 terminal onData handler 回归 11 PASS；scripts 全量 179 项，176 PASS / 3 既有环境 skip / 0 FAIL。
- 类型、生产 build、Command Sender MVP/active target、WF-04C、startup、i18n、snapshot、WF-07、PTY、line-budget、diff/source 检查通过。
- MacroDialog 与录制源弹窗仍为独立 lazy chunk；既有大 chunk 警告保留。共享轻量 limits/policy，无新依赖、IPC、数据库或 Rust 更改。
- 旧 MVP source gate 在基线已引用过期 history 字段、硬编码中文和旧 margin 断言；同步到当前 history/i18n/既有非伸缩工具组契约，其它输入/样式/顺序/生命周期门禁保留。
- 手工 GUI、协议与三主题验收保持 MANUAL_REQUIRED，后续统一进行。过滤为保守启发式，不承诺所有未知敏感值可自动识别；宏仍不持久化/导出。
- PR #61 更新为 A+B 最终范围，新提交集成 CI 另留证；基线 CI #587 不替代本次结果，不自动合并。
