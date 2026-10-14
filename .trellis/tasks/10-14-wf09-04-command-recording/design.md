# 设计

Shell 创建唯一、内存-only recorder；producer 在已有发送 handler 开始时创建只带 token/源身份的 ticket，敏感分类先于待完成队列。实际 terminalWrite 成功后按真实 session 判断源是否写入；finish 仅接收布尔投递状态，不接收 native 错误。队列保持提交顺序、generation 撤销旧 ticket，采集时间使用单调时钟。

Recorder snapshot 只含已经确认的 sanitized 步骤、源和状态。敏感模式立即暂停新接收，成功后生成 command=空串/masked=true 的占位；常见认证提示命令也保守暂停。共享已知敏感检测与 TerminalPanel/自动 Sender history，普通命令历史沿用既有行为。不能把启发式当成完整秘密识别。

MacroLauncher 使用 recorder subscription，按需打开共享 Radix 录制源弹窗；源默认未选。开始后打开已有 Command Sender。停止并编辑将 recorded steps 作为 MacroDialog 初始草稿；补填令 masked=false，createMacroPlan 拒绝仍 masked 的步骤。关闭 editor 丢弃录制草稿，bar/Workspace 卸载清空 producer。

limits 独立轻量模块供 recorder/replay 共用，不把 editor/runner 合进首屏。无新 IPC/Rust/dependency/database/snapshot。沿用现有全局 token、AppSelect、WorkflowDialog，真实主题验收后续统一。
