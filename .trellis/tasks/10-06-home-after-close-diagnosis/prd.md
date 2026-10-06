# 关闭所有终端后 Home 异常诊断

## Goal

修复关闭活动 SSH 实例、回退至其它会话时空连接被误判为 SSH 导致整个页面空白的问题；关闭全部会话后 Home 正常可用。

## Requirements

- 用户流程：在 macOS 原生 NexaTerm 中关闭顶部全部会话实例标签后，Home 应继续可见并可操作；维护者实际看到一片空白。
- 原始诊断现场为 `f3b471e0d5dd18f98aa0c2a891bc2e4fadcc03e3`；2026-10-06 维护者确认在独立分支修复、补回归测试、验证后编译启动。新分支以最新 `origin/main @ 17a4365f` 为基线。
- 引用 `docs/WORKFLOW_SPEC.md` WS-M01、WS-M02、WS-E07；不改变既有实例关闭与 Home 产品语义。
- 先取得用户实际症状、前端错误或可重复失败信号，再判断关闭生命周期、Home 渲染或 WebView 是否异常。
- `secret_missing` 仅作为独立诊断线索；没有因果证据不得归因为 Vault/凭据后端，也不得为消除日志修改相关实现。
- 当前授权包括已确认最小修复、测试和编译启动；不清理用户数据，不自动提交或推送。
- 源头修正 `isSshConnection` 的空对象判定，保留已有历史 profile 缺 protocol 时默认 SSH 的兼容行为。不要在消费端填虚假连接或吞掉异常。
- 不将本任务未经审核的诊断材料混入 WF-07 PR #44。WF-07 A/B 冷启动人工验收已于 2026-10-06 获维护者确认通过；Home 关闭回归独立验收。

## Acceptance Criteria

- [x] D-HOME-01：确认关闭对象为 NexaTerm 顶部所有会话标签，实际症状为 Home 一片空白。
- [x] D-HOME-02：保留现场并记录进程、开发服务、原生窗口结构及已知取证限制。
- [x] D-HOME-03：取得能够对应当前空白症状的前端错误/最小复现，并以证据区分根因与相关日志。
- [x] D-HOME-04：给出最小修复范围、必要回归验证及尚未证实的风险，等待代码修改确认。
- [x] F-HOME-01：null / undefined 不是 SSH；合法 SSH 与缺 protocol 的已有 profile 保持兼容。
- [x] F-HOME-02：真实 controller 在关闭活动 SSH → 本地/RDP/VNC 回退 → 全部关闭时渲染不中断，最终为 Home。
- [x] F-HOME-03：类型检查、前端测试、相关脚本测试与启动边界、build 全部通过。
- [x] F-HOME-04：修复版本成功编译启动，原生窗口能显示完整 Home。
- [ ] F-HOME-05：Mac 真实关闭回归由维护者验收，自动化证据不得代替人工结论。

## Notes

- 诊断证据见 `diagnosis.md`；确认后的执行顺序见 `implement.md`。
