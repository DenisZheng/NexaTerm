# Rlogin 母版交互

在原有prototype/light-neutral/mxterm-light-neutral.html增加可点击Rlogin流程，没有另起原型。样式复用实际tokens.css，紧凑表单与可见焦点；提供亮/暗/system切换。原型中的网络/清理结果均由明确标记的模拟按钮触发，不是provider证据。

ui-ux-pro-max既有已核验MIT工具执行focus/modal/error recovery及React async cleanup检索；落实为焦点可见、状态文字、清理失败保留重试、无隐式重连许可。DOM验证通过：保存不连接、固定目标、本次许可、取消、失败保留、重试清理、重连再许可、主题状态。原生dialog焦点/尺寸/视觉与WebView三主题验收仍待统一人工进行。

继续迁移到真实ConnectionDialog与workspace owner；原型通过不表示真实终端已完成。
