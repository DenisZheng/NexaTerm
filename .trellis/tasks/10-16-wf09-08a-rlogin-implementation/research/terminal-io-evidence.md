# 终端IO适配器执行记录

状态：开发与验证中，基于PR #73文档收口573dbc5；不是已挂载UI或真实rlogind验收。主任务保持in_progress。

实现范围：冻结八种终端编码、独立text write IPC、128KiB/256块有界键盘/粘贴队列、按generation/epoch增量解码、解析确认、dispose后丢弃确认、最新resize合并和实际close屏障。完整契约见frontend/rlogin-terminal.md。terminal_available仍false；连接模型、母版原型、实际终端UI、DNS、Windows精确边界与真实互通继续后续。

开发前使用trellis-before-dev并核对WORKFLOW_SPEC v0.7的WS-P01/P02/P04、WS-R01/R02。终端IO是后续UI的工程依赖；本slice不改视觉或挂载入口。已读取官方ui-ux-pro-max技能（nextlevelbuilder/ui-ux-pro-max-skill，MIT；SKILL blob41f8e2f）与desktop quick reference，执行keyboard focus modal/async form cleanup审查。结论落实为后续沿用Radix焦点、token、显式错误和真实资源cleanup；不把移动端尺寸或新视觉系统套入桌面工具。临时审查工具未进入app或依赖。

回归发现并修复两项真实编码边界：标准ISO-2022-JP文本decoder不能直接接收VT的ESC[序列，文本encoder也拒绝ESC/SI/SO控制；部分运行时的Shift-JIS decoder将DEL映射到SUB。生产路径明确分开终端控制与文本解码，ISO scanner只保留最多两个待判定前缀字节，不缓存增长的OSC/DCS正文，编码designation不进入xterm；原始VT控制不丢弃、不清屏。纯字节/每种分片位置、JIS状态跨ANSI、控制串分片、flush与EOF测试守住这一边界。

本地无Rust工具链，Rust执行证据必须由三平台原生harness和完整应用CI取得，不能以静态检查替代。原生harness新增的encoding_rs=0.8.41为应用已有lockfile子集，无新应用crate或传递依赖；其余安全、许可证、fixture门禁保持。

最终代码SHA、CI编号和执行计数在实际结束后回填。

## 验证中发现的问题

首轮0e2608e原生CI25在测试编译阶段失败：json!宏内的Rust字符串误写JSON的\\u0000转义。9f67cd8改为Rust的\\0，保留同一NUL断言；原生CI26全部通过（Linux66/macOS67/Windows65，另独立wire各10）。

9f67cd8完整CI640的前端1016/1既有todo、安全、许可证、fixture及Linux/macOS Rust通过；Windows为538通过/2失败，均位于此前已有的并发schema升级与XDMCP进程身份断言，全部新增Rlogin测试通过。未把该次全量CI标为成功，也不通过重跑或延长超时抹去失败。

生产SQLite初始化改为先BEGIN IMMEDIATE，再做版本检查及原子DDL batch；保留原5000ms等待与错误处理、后续VACUUM/FK迁移边界。新增DDL失败回滚测试，已有四线程升级用barrier同时起步。官方事务/隔离文档支持先写锁的机制；旧日志没有保留扩展BUSY码，不声称已测得BUSY_SNAPSHOT。

XDMCP旧断言在stop后按PID重新OpenProcess，不能排除PID重用；现于stop前保留真实child句柄，stop后要求该句柄立即signalled，无额外宽限等待。自然退出fixture由测试放行，保证退出前能捕获身份；三平台native harness与应用测试共用观察器。生产job回收未修改，不把旧日志直接解释成已证实的进程泄漏或已证实的PID重用。
