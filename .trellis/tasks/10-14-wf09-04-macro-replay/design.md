# 设计

复用 MultiExec 唯一实例目标、resolveCurrentMultiExecTarget、writeMultiExecCommand 与 terminalWrite。MacroLauncher 仅含轻量按钮及 lazy 边界，MacroDialog 在显式打开后加载。Dialog 使用共享弹窗壳、现有按钮/输入 token；项目与环境未发现 ui-ux-pro-max，沿用既有样式，不改信息架构或视觉体系。

预览工厂验证边界后返回深复制并冻结的计划。运行器每次写入前比对预览 key/session；首个失败停止，不移交到重连 session。步骤顺序和固定目标顺序保持串行，延时为每步发送前等待。write timeout 不解释为未执行，界面告知不可自动重试。

取消 AbortController 终止等待；正在执行的 Tauri write 不能撤回，等待其完成或 30 秒上限后结束。组件 ref 同步占操作槽，卸载只 abort 且屏蔽回调。编辑、预览、运行、结果均组件内存状态，关闭后丢弃；结果只保留序号、目标标题、投递状态。

前端不新增 invoke 或本地持久化；Rust 继续拥有会话 I/O。无 schema/dependency/API 变更。真实终端与三主题验收集中补录。
