# 实施与验证

1. 完成官方与源码审计，输出差距表；独立分支基于 PR #42 e9a80f7c。
2. 接入 Home / opened-instance / Files 呈现。
3. 收口 MultiExec / Split / Toolbar / 分组及 Files 动作顺序。
4. 补入口行为与实例定位测试，运行 type check、frontend build、全量 frontend unit tests、相关 source gates。
5. 检查主题、语言与窄宽度，启动本工作树真实 Tauri，记录维护者人工验收结论及其范围。
6. 核对 diff 和暂存范围，按维护者“都验收OK了，提交吧”的授权提交本轮改动；不提交生成物、环境配置、原工作树变动，不 push / merge。

最终运行命令、结果与限制记录于 `verification.md`。
