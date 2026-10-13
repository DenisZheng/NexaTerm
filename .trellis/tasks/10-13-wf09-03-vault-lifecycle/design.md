# 设计

保留现有 useSecretVault 接口及 Gate/Settings 命名表单，不改视觉、超时选项或默认值。操作 ledger 只持 kind/token 和串行 promise 链，不持密码、凭据列表或文件内容；密码仅在既有表单和一次 transient IPC 调用中存在。

所有 Vault IPC 经单条队列，状态读取有独立 token。普通 mutation 防重；lock 可取代在途 mutation 的 UI token，立即清除 cached availability，实际 lock 命令在已开始 mutation 后执行。未开始的旧请求跳过，已开始命令不声称被取消。旧 unlock 不返回有效 UI 成功；已实际完成的 rekey 仍向原调用者报告成功，使 settings 的 masterPasswordEnabled 与真实加密模式一致。

失败状态保持未知/锁定门禁，不把读取失败视为初次创建。scope suspend/activate 支持 StrictMode effect replay；真实卸载不应用异步结果。local 自动尝试在操作被接受后标记，避免 busy 拒绝导致永远不再尝试。

闲置计时单独复用现有键盘/指针/滚轮监听，记录最后活动时间与 deadline。每个活动事件先检查 deadline，再允许重置；focus/visibility 只检查、不延长闲置。超时回调只请求一次 lock，卸载清理 timer/listeners。

主密码全程保留原始字符串；仅用 trim 判断是否全空白。设置表单沿用原有取消语义，提交由统一操作槽防重复。无新加密、持久化 schema、平台 provider 或关闭会话副作用。
