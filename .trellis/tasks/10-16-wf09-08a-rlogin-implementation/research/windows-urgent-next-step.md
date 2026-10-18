# Windows urgent边界：下一阶段验证入口

2026-10-18继续核验；Windows exact_flush/runtime/terminal仍为false。该缺口不阻塞已完成Unix真实入口/DNS，也不阻塞Rsh的普通双流。不能把缺口写成已实现或仅剩人工验收，也不据此断言Windows永远不能支持。

## 官方API约束

- [Winsock OOB说明](https://learn.microsoft.com/en-us/windows/win32/winsock/protocol-independent-out-of-band-data-2)分别描述OOB队列与流中位置；其TCP注意项明确inline模式下SIOCATMARK不能充当Unix式当前位置检测。这与既有Windows原生probe中inline位置不可用的结果一致。页面通用段落与TCP注意项应一起读，不能只摘取前者。
- [Winsock IOCTL](https://learn.microsoft.com/en-us/windows/win32/winsock/winsock-ioctls)中的队列是否含未读OOB不等于本项目要求的精确flush分界。FIONREAD是队列量，也不能凭它确定urgent字节的流序号。
- [WSARecv](https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-wsarecv)文档明确描述的输出标志用途是MSG_PARTIAL；不能未做原生实证就把MSG_OOB输入标志当作可靠的逐次返回边界标签。

## 候选组件核验

已有公开vendor源分支的[Windows传输](https://github.com/atlassian/putty-sourcetree-fork/blob/master/windows/winnet.c)和[Rlogin处理](https://github.com/atlassian/putty-sourcetree-fork/blob/master/rlogin.c)可用于定位接口思路，但不是当前上游版本证据；其Rlogin处理留下flush/flow未落实的说明，因此不能把“该组件支持Rlogin”推成“满足本项目全部flush契约”。本次只阅读，没有复制代码或引入依赖。后续采用组件必须独立核对版本、许可和保留声明，并通过同一精确断言。

## 下一阶段可执行矩阵

如验证替代接收API/组件，单独增加Windows原生fixture：普通数据可包含与控制字节相同值；分别覆盖无urgent、前段未读/恰在mark、MSG_PEEK前后、合包尾部、连续urgent、EOF及多次观察。至少断言flush只移除mark前未交付字节、完整保留mark后数据，且控制字节不变成终端文本；测试只记录自造fixture的计数/固定元数据。不能用payload匹配、扩大读取后全丢弃、窗口级清屏、延迟显示或关闭关键断言掩盖位置缺失。

当前没有满足以上矩阵的新Windows backend；生产能力继续诚实关闭。Rsh可以独立复用保留源端口/正常TCP生命周期，不套用这个urgent gate。
