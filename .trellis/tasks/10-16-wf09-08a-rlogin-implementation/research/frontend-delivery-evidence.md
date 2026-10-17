# Rlogin 前端有界交付执行证据

本轮源码`251f2e2cef780e857e2f6b1dafbacfc50d6f9e4d`；[Draft #73](https://github.com/DenisZheng/NexaTerm/pull/73)基于PR #72的06e2cc064990b4b7795ac78ae69874e95e514641。Rust生产源码/测试/workflow未修改，保留PR #72原生和完整应用基线。

## 实现与验证对象

- 九项实际typed wrapper复用共同invoke和错误本地化，校验UUID/能力/status/read。固定reason白名单、规范十进制u64、字节数组和flags，拒绝未知字段/错误类型；数字序号不通过JS number重建。
- generation内单owner、最多16个active/closing owner；单个poll、单帧ready/writing、精确ACK。render接管前flush可丢弃旧帧并精确确认，接管后等待解析回调，不清屏；回调不保留第二份字节数组。
- read失败可能已经消费backend帧，因此固定错误并主动close，不自动重读或重放输入。close立即失效回调，等待实际backend和已发IPC；失败保留lease供明确重试。迟到响应不能操作新generation。
- write和resize各只允许一个在途调用，无隐藏输入队列；单次输入≤32KiB，调用前固定字节和尺寸。没有新UI、编码、后台timer、日志或持久化入口。

## 本地执行

- 新增71项真实TypeScript行为测试：bridge26、wire38、实际wrapper5、runtime adapter2；无skip/todo。全量前端116文件959通过/1既有todo。
- TypeScript检查通过。Vite构建通过，TerminalPanel与WorkspaceShell保持独立chunk；23项CI frontend source检查、capability/CSP、脚本179通过/3既有环境限定skip、任务上下文20条及diff检查通过。
- 首次本地Vite触及Node默认约2GiB堆上限；相同源码使用单进程`node --max-old-space-size=4096 node_modules/vite/bin/vite.js build`重跑通过。环境cgroup上限8GiB；未更改项目/CI的资源设置或门禁。类型检查在Vite前已通过，后续新增测试也已单独通过tsc。
- 初次测试编写中，mockReset箭头hook返回了mock函数，测试框架将它作为清理函数调用；已改为无返回的hook块。ES2020不提供replaceAll，测试改用正则replace，未提升tsconfig目标。测试数据表显式封装byte数组，避免it.each将数组展开后仅测到首元素。

## 完整CI

[CI #637](https://github.com/DenisZheng/NexaTerm/actions/runs/38997375605)全部7个实际执行job成功；条件打包未触发。源码对象为251f2e2，不以文档收口的新SHA替代该执行对象。

| 平台 | 应用library | ignored / failed |
| --- | --- | --- |
| Linux | 532 passed | 4个既有ignored / 0 |
| macOS | 533 passed | 0 / 0 |
| Windows | 532 passed | 0 / 0 |

各平台其它二进制19项、集成1项及0项/doc-test均通过。前端116文件959通过/1既有todo；脚本179通过/3环境限定skip；类型/构建/source、安全与许可证、真实SSH/X11/双跳/隧道fixture均通过。新增71项均无skip/todo；完整前端在CI标准设置下构建成功。Rust/workflow未修改，未降低现有门禁。真实WebView/服务端验收仍单列。

## 尚未交付

桥接模块尚未挂载终端UI/连接模型，terminal_available仍false；编码/按键/粘贴背压接入、DNS、Windows精确flush、真实rlogind和WebView/三主题验收继续后续。本轮不算完整Rlogin可用、Rsh已实现或内置X server已分发。
