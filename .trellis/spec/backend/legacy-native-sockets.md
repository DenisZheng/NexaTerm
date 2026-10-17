# Legacy 原生 socket 与 Rlogin 控制组件（L1 基础）

## 1. 范围与触发

Rlogin 与后续 Rsh 共用的 IPv4 TCP 基础，使用已锁定的 Tokio/libc/windows-sys；只新增既有 windows-sys 的 WinSock feature。无外部客户端、DNS、提权 helper、权限修改或高源端口兜底。本层不注册 IPC，不实现会话 manager、握手 adapter、连接许可或终端 UI，不声明完整协议可用。上层会话owner的四连接配额、单次许可与队列契约见rlogin-session.md。

## 2. 接口签名

- `bind_reserved(local: Ipv4Addr, cancel: &AtomicBool) -> Result<ReservedSocket, SocketError>`。
- `ReservedSocket::{local_addr, connect(target: SocketAddrV4, cancel: &AtomicBool), listen}`；async connect 返回 `NativeSocket`，listen 消费保留句柄并返回 Tokio listener（尚无 Rsh 协议实现）。
- `NativeSocket::{from_stream, local_addr, peer_addr, poll_ready, read, write, close}`；独占持有 nonblocking、OOBINLINE=false 的 stream，不提供 clone。`supports_urgent_boundary()` 是当前 adapter 的精确 mark 能力，不能代替协议能力。
- `RloginReader::new(socket, rows, columns, x_pixels, y_pixels)` 消费**已完成初始交换**的 socket；rlogin_connect 在 ACK 后构造并恰好转移一次合包尾部；详见 rlogin-connect.md。
- `RloginReader::{poll(output, has_capacity), input(bytes), resize(...), write(bytes), close}`；事件为 `Idle / Closed / Data(count) / Control{flush_output, flow, window_frame}`。

## 3. 数据、平台与资源契约

地址只接受指定的数字 IPv4，拒绝 unspecified/multicast/全一 broadcast；目标端口非零。源端口从1023降序尝试到512，最多512次，每次创建新 socket，关闭 reuse；Windows 在 bind 前设置 SO_EXCLUSIVEADDRUSE。一直持有**实际绑定**的 socket 至 connect/listen/drop，不能探测后释放再声称已保留。bind 每候选检查取消；connect 截止15秒、取消轮询25毫秒，丢弃 future 也释放实际句柄，无后台 connector 残留。此处不是解析至握手全流程总截止，上层owner必须继续传入全流程绝对截止；当前数字IPv4建立契约见rlogin-connect.md，DNS预算仍待实现。

遇到 PermissionDenied 也继续扫描，因为 Windows 独占冲突可能返回 EACCES；全部拒绝返回 AccessDenied，全部占用返回 PortsBusy，混合为 PortsUnavailable。不能按平台名称推断管理员要求。close/drop 回收所属 socket 和 Darwin monitor；不表示远端进程已被杀死。

read/write 单次≤32KiB；read buffer 必须非空。`Some(0)` read 是 EOF，WouldBlock/Interrupted 是 `None`。write 返回实际长度，上层 owner 必须保留未写后缀，串行控制帧与用户输入。poll 非阻塞且先处理 urgent；正常流中的02/10/20/80/FF/NUL不解析成控制。Linux 使用 poll priority/band；Darwin 独占 kqueue，EVFILT_READ 为 level，EVFILT_EXCEPT+NOTE_OOB 使用 EV_CLEAR，EOF不算 urgent。Darwin将已观察urgent保留为所属monitor的pending状态，只有实际MSG_OOB消费成功才清除；readiness查询和peek都不能吞掉通知。该monitor可移动但不共享给并行reader。Darwin的OOB peek在mark上会清位置标记，因此必须先查询位置：已到mark就直接消费并发控制事件，未到才peek并等待游标推进；不能将peek理解为对位置无副作用。等待urgent字节时若已到mark，不读取后段充当前段隔离数据。Unix 用 POSIX sockatmark C ABI，禁止硬编码 ioctl 数字。

| 当前 adapter | OOB 与边界 | flush 行为 |
| --- | --- | --- |
| Linux / macOS | 未到mark时MSG_OOB|MSG_PEEK并保留控制字节；已到mark时直接消费，不再peek | 先发 flush 事件，再每次最多丢弃8KiB前段，保留后段 |
| Windows | select exceptfds；非 flush 控制立即以 MSG_OOB 消费；本 adapter 精确 mark 能力为 false | 首次真实 flush 返回 sticky UrgentBoundaryUnavailable；不清隔离区、不读或丢弃普通字节、不发成功控制事件 |

Darwin实际消费OOB后，必须同时清所属pending和旧内核filter状态：在同一次kevent变更中EV_DELETE旧EVFILT_EXCEPT，再EV_ADD/EV_ENABLE/EV_CLEAR并请求NOTE_OOB。只清Cell或只依赖EV_CLEAR不足；前段read可再次排入旧NOTE_OOB，之后普通数据事件携带旧fflags会诱发重复MSG_OOB/EINVAL。重建的attach重新检查当前socket，保留这段期间新到达的urgent；注册错误仍返回IoFailed，不能吞EINVAL或当作正常Idle。readiness与peek仍不执行清理。macOS必须跑32轮重复window/request/normal-data回归，同时保留既有精确flush、peek位置与重复观察断言。

Windows 的实际 provider 探针中，非 inline recv 跨过前后段，SIOCATMARK 未提供所需游标位置；inline 探针也未提供可用位置边界。该差异是当前实现缺口，不是 Windows 精确 flush 已实现或不可实现的结论；完整 Windows Rlogin 能力保持关闭。禁止在正常字节中寻找相同值、清空所有后续数据，或把负向能力测试写成 flush 互通通过。

已知位02=flush、10=远端流控、20=本地流控、80=窗口请求；支持组合，10+20时本地优先，未知位作为 urgent 元数据忽略。urgent 指针先到、字节未到时，前段最多隔离32KiB，等待控制15秒；超预算明确失败，该截止不应用于普通安静连接。有效 flush 清隔离区，其它控制按序释放。隔离区须计入上层 owner 的1MiB输出预算。owner 收到有效 flush 必须清理自己尚未交付渲染的输出，本层没有该队列。无输出容量或本地暂停时仍处理 urgent，普通输出施加 TCP 背压；有效 Unix flush 仍推进前段丢弃。

本地流控初始启用：DC3暂停、DC1恢复，消费这两个本地控制输入；远端模式原样发送并释放本地暂停，其它字节含 tilde 始终不变。保存最新验证过的12字节窗口帧，协商前 resize 只更新；80返回最新帧，协商后 resize 才返回待写帧，不能主动发送未请求的窗口帧。

## 4. 校验与错误矩阵

所有错误为固定 enum/code，无端点、用户、payload 或原始 OS 错误；socket Debug 为不透明固定文本。

| 条件 | 固定结果 |
| --- | --- |
| 地址/目标端口不合法 | InvalidAddress；不创建 bind socket |
| 预先取消 / 建立截止 | Cancelled / Timeout |
| 所有候选拒绝 / 占用 / 混合 | AccessDenied / PortsBusy / PortsUnavailable |
| 创建等不可用 / connect失败 / IO失败 | Unavailable / ConnectFailed / IoFailed |
| 空read或超过单块预算 | InvalidChunk；不执行该read/write |
| urgent隔离区满 / Windows精确flush缺失 | UrgentBufferFull / sticky UrgentBoundaryUnavailable |
| 行列为零 | L0 ProtocolError::InvalidWindow，构造失败释放传入socket |

## 5. 正常、基线与反例

正常：持有低端口并从该句柄连接；OOB80返回最新窗口帧，普通80/FF/NUL仍作为数据。基线：模块导入不打开 socket，resize 未协商不发送。反例：探测后释放端口、静默改用高端口、吞权限错误、把 EOF 当 urgent，或在 Windows 当前 adapter 上假报 flush 成功。

## 6. 必需测试与断言

候选扫描边界/混合拒绝/跳过单个拒绝；取消前零IO；真实 bind所有权与连接源端口核对，或记录真实AccessDenied（不能据此称登录可用）；超时、取消和实际 Tokio task abort 均释放句柄。原生 loopback验证普通字节透明、OOB独立、before/peek/read/consume/after mark探针、组合位、窗口重复请求/resize、暂停/raw恢复、背压下urgent、EOF、隔离预算/仅pending控制超时。Unix断言精确flush前后段；Windows断言固定sticky错误且全部前后普通数据仍未读。Windows另有inline探针，不能按值分离混合字节。

独立 harness 导入生产模块，依赖锁必须是应用锁的子集，三平台实际执行；保留完整应用 CI。取消测试有2秒夹具调度预算，独立80毫秒超时用例不变；不得因平台失败删除语义断言。最终执行证据与调试根因见 [native-socket-evidence.md](../../tasks/10-16-wf09-08a-rlogin-implementation/research/native-socket-evidence.md)，不在规范中堆叠已失效修复假设。

## 7. 错误与正确写法

错误：按普通02字节flush、用SO_REUSEADDR绕过Windows冲突、把WouldBlock当断开，或认为同名API必有相同mark语义。正确：分离OOB、保留真实独占句柄、按原生证据选择能力，无进展保持Idle，缺失精确边界明确失败并保留数据。

API依据：[POSIX sockatmark](https://man.netbsd.org/sockatmark.3)、[Darwin event.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/event.h)、[Microsoft OOB](https://learn.microsoft.com/en-us/windows/win32/winsock/protocol-independent-out-of-band-data-2)，及任务中的固定 BSD profile。没有复制外部实现。
