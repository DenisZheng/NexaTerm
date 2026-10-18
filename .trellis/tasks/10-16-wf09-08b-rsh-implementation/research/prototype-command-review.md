# Rsh 命令界面审查

沿用同一 light-neutral HTML 母版，新增可点击命令任务：显式运行许可、双流/独立EOF、stdin EOF、信号、取消、清理失败重试及显式再次运行。原型按钮明确模拟，不冒充网络结果。真实React接入同一工作区实例标签与新建会话菜单，命令任务不共享PTY操作或保存连接模型；不保存命令/运行句柄/输出或自动恢复。

设计审查使用 ui-ux-pro-max：查询 error clarity validation / ux，返回聚焦错误摘要、role=alert和标题层级；查询 async cleanup suspense / react，返回effect清理、明确异步失败和并发反馈。使用项目现有Radix/Lucide/AppSelect、共享表单/按钮及--mx-* token；标签可读、错误就近且聚焦摘要、两路文字标签与EOF独立显示，三主题不依赖硬编码颜色。此记录仅为设计/代码审查，真实WebView三主题验收后置。
