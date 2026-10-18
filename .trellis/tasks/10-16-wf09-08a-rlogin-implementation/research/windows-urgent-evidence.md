# Windows urgent API 原生反例（2026-10-18）

本轮代码 `99bffa6293c2ba3d98bea3d5ea8cc12cdcebd2c2`，堆叠 [Draft #82](https://github.com/DenisZheng/NexaTerm/pull/82)，base #81。只新增原生API实验/反例与既有windows-sys的System_IO feature；没有新增crate/版本、外部代码、helper、权限或生产接收逻辑。Windows exact_flush/runtime/terminal/dns仍为false，精确flush仍须实质开发，不能算只剩验收。

## 执行对象与结果

- [原生45](https://github.com/DenisZheng/NexaTerm/actions/runs/39143799100)三平台全部SUCCESS：core Linux120/macOS121/Windows122，wire各10，无skip/ignore。Windows Server2025，10.0.26100，runner镜像windows-2025-vs2026/20261007.264。生产模块仍导入同一个harness，应用lock子集核对通过。
- [完整CI664](https://github.com/DenisZheng/NexaTerm/actions/runs/39143799060)全部7个执行job SUCCESS，条件打包未触发。Rust lib Linux616/4既有ignored、macOS617/0ignored、Windows619/0ignored；各平台binary19/integration1/doc0。前端139文件1160通过/1既有todo，脚本191通过/3既有环境skip，类型/构建/source/security/license/fixture门禁全通过。没有新增skip/ignore或降低门禁。
- 本地line-budget、startup source、task manifests和staged diff检查通过；没有Rust工具链，本地静态检查不算Rust原生执行。

## API 与具体观察

`legacy_socket/windows_probe.rs`测试只使用固定自造loopback字节，普通数据包含与urgent相同的82/B2值；不打印真实目标、输入或输出。

| 原生路径 | 观察 | 对精确flush的含义 |
| --- | --- | --- |
| WSARecv，separate，1/128字节buffer | 输出flags均0；大read把前后普通字节合成8字节 | 无逐块OOB返回标签，不能从返回flags定位 |
| WSARecv，inline，1/128字节buffer | 输出flags均0；大read一次返回含urgent的9字节 | 不能按值从普通流剥离控制字节 |
| WSARecvEx，inline/separate | 同样没有边界返回标志 | 该API的flags仅输出，不能用它执行MSG_PEEK |
| WSARecv/普通recv MSG_PEEK，尚有前段 | 可只返回mark前段，即使普通read会跨越 | 这是局部观察，不等于可检测当前是否在mark |
| 已精确读到mark，WSARecv/普通recv MSG_PEEK | 直接返回后段6字节，flags0；重复观察一致 | 按peek长度继续丢弃会误删后段 |
| 已精确读到mark，ioctlsocket/WSAIoctl SIOCATMARK | 两者仍为false | 替换查询入口没有恢复Unix位置语义 |

游标夹具覆盖前段长度0/1/4/8193，逐次先消费夹具已知的准确前段长度，再观察当前位置；消费urgent前后的后段均完整保留。已知长度只用于证明OS当前位置，生产不能拿它当作来自网络的边界信息。

## 不可区分反例

两个独立socket使用完全相同的6个普通82字节和一个urgent82，分别把urgent放在全部普通数据之前/之后。正确flush应分别保留6字节/0字节。但在仍未消费OOB时，以下观察完全相同：FIONREAD=6、WSARecv(MSG_PEEK)=(6,flags0)、peek普通字节相同、两种SIOCATMARK=false、MSG_OOB peek=82。保持连接和发送方向EOF两种情况均通过同一反例；观察之后全部普通数据仍能原样读取。

这直接排除本轮所测试的“读取flags”“换用WSAIoctl”“按普通peek长度丢弃”方案；没有将有限API反例推成Windows所有backend永久无法实现。首个控制的精确边界已经不可确定，不能跳过该反例，改以连续urgent、ACK尾部或renderer清屏制造通过。

## 失败修正

首轮原生43/代码778604c因夹具错误地假设WSARecvEx支持MSG_PEEK而失败：第二次调用返回0，因为第一次已经消费数据。[官方WSARecvEx说明](https://learn.microsoft.com/en-us/windows/win32/api/mswsock/nf-mswsock-wsarecvex)明确输入flags被忽略。修正为只在WSARecv执行peek；保留字节完整性/重复peek断言，并在最终新增“相同观察、相反正确丢弃长度”断言，没有将失败吞掉或降低生产门禁。原生44先验证了游标行为，45加入WSAIoctl及强反例后全部通过。

## 后续实现入口

继续本任务，先要求替代接收backend给出与普通同值字节无关的可靠流位置/边界元数据，并能区分上述两种fixture；在此之前不替换生产adapter或开启能力。若采用组件，先核对精确版本、许可和实际Windows接收实现，不以“支持Rlogin”替代flush契约。得到可行backend后，仍须完成原next-step中的无urgent、空前段/恰在mark、peek、ACK尾部、连续urgent、EOF、背压/epoch和三平台完整CI矩阵。

Unix真实rlogind、三平台WebView等验收按约后置。Rsh S2已开发交付；XDMCP随包引擎、打包、桌面接入及Unix宿主硬崩溃资源监督仍是开发项。

## 一手依据

- [Microsoft OOB/TCP说明](https://learn.microsoft.com/en-us/windows/win32/winsock/protocol-independent-out-of-band-data-2)：须一起阅读通用段和TCP注意项。
- [Winsock IOCTL](https://learn.microsoft.com/en-us/windows/win32/winsock/winsock-ioctls)：队列/是否尚有OOB不能直接当作当前位置。
- [WSARecv](https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-wsarecv)：输入与输出flags；原生实证不支持本项目所需逐次边界标签。
- [WSARecvEx](https://learn.microsoft.com/en-us/windows/win32/api/mswsock/nf-mswsock-wsarecvex)：输入flags被忽略，TCP下不返回MSG_PARTIAL。
