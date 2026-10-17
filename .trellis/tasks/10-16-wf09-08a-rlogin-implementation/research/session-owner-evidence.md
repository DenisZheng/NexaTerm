# Rlogin 会话owner执行证据

[Draft #71](https://github.com/DenisZheng/NexaTerm/pull/71)，基于 #70。当前仅交付headless会话owner，不注册IPC/终端UI或声明完整协议可用。

## 实现边界

- 冻结配置和本次明文协议许可；main owner、15秒未用租约、一次消费、新UUID generation，最多16个瞬时句柄和4个真实socket worker。主窗口身份的Tauri核验仍属于下一阶段。
- worker独占socket；从原15秒绝对截止建立，到输入/窗口/urgent与输出控制均在单actor内。取消只是信号，close等待真实完成；FD先于lease/配额析构。caller丢弃、实际task abort和manager drop均有回归。
- 输入/输出各1MiB逻辑字节预算、32KiB块及32条目上限。输入的已取出/partial后缀保留额度；最新resize合并。输出为单帧pull/ACK，交付后仍占额度；flush递增epoch，保留已交付旧帧直到它自己的ACK，迟到ACK不消耗新帧。
- EOF只表示transport结束，保留未消费尾部；不推断认证/登录或远端exit code。不接SessionLogs、SSH凭据、历史/宏/MultiExec和自动重连。

## 调试复盘：OOB后的关闭断言

### 1. 根因分类

E/B：夹具把“消费OOB”和“普通TCP接收游标已经越过urgent位置”当成同一个事实。[原生 #16](https://github.com/DenisZheng/NexaTerm/actions/runs/38990879323) Linux48通过/1失败，macOS49、Windows48通过；唯一失败是native flow用例最后的干净EOF断言，之前的raw input、window和pause/resume断言通过。

### 2. 首次修复为何不足

在读取held后增加outbound写屏障，只能证明actor又运行了一轮，不能推进相反方向的普通接收游标。[原生 #17](https://github.com/DenisZheng/NexaTerm/actions/runs/38990999407) Linux同一关闭断言仍失败。

### 3. 直接验证及最终修复

当前Linux主机以Python标准socket执行两组真实loopback探针：发送held/MSG_OOB，读取held并消费OOB后直接close，对端得到ConnectionResetError(104)；增加并读完post-mark tail再close，对端得到EOF。没有外部服务、权限修改或生产shutdown改动。

最终fixture在暂停期urgent之后发送tail，恢复后按多个frame/ACK累计并精确核对heldtail，再断言干净EOF。这既证明普通游标已越过mark，也避免假定TCP分片等于输出块。未提高超时、跳过测试或放宽公共EOF helper。

### 4. 防复发与系统性扩展

有意取消且接收侧仍留数据时，EOF或reset都能说明连接已释放；要求干净EOF的场景须先建立已drain前提。普通数据、urgent、两个方向的写屏障及worker结束分别取证，不混为一个完成标志。slow-consumer主动取消的reset允许范围只在该专用fixture内，不能推广成所有关闭测试的吞错。

### 5. 知识落点

具体API、预算与断言要求已写入 `.trellis/spec/backend/rlogin-session.md`。harness直接导入生产模块，无模板源镜像需要同步。

## 当前执行结果

执行代码基准：`20c2a6b4eb72e16066f0c077178bbd2d1e204d3a`。

[原生 #20](https://github.com/DenisZheng/NexaTerm/actions/runs/38991575092)：全部3个job通过；L0十项另行执行，不重复计为新增；生产模块harness依赖锁子集核对通过，无skip/ignore。

| Runner | harness | 实际能力证据 |
| --- | --- | --- |
| ubuntu-22.04 | 49通过 | owner全部用例及Unix精确flush；公共低端口路径实际AccessDenied |
| macos-14 | 50通过 | 同上，另含32轮连续窗口控制回归；公共低端口路径实际AccessDenied |
| windows-latest | 48通过 | owner全部用例，公共adapter实际低源端口建立/ACK/尾部/清理；Windows精确flush仍不可用，负向保留数据断言通过 |

普通socket会话fixture不冒充低端口或真实rlogind互通；Unix真实AccessDenied不是skip，也不证明协议登录可用。窗口与流控等正常数据路径没有因Windows精确flush缺失而跳过。

[完整应用 CI #632](https://github.com/DenisZheng/NexaTerm/actions/runs/38991575128)：前端、安全、许可证、服务fixture和Linux通过；macOS所有Rlogin用例通过，但既有XDMCP回收测试读取到空PID文件失败，不能标为完整通过。修复该fixture后重跑，见下节。旧代码完整CI因后续修正而取消，不复用为最终证据。原生#18曾在旧native_oob_window用例出现IoFailed，#19稳定复现及最终修复见下节。

本地任务manifest、行数、diff、workflow YAML、Tauri capability/CSP检查通过；本机无Rust/gitleaks，原生编译与完整安全扫描以CI结果为准。harness只增加应用lockfile已有的uuid pin，无应用依赖/lock变更。

## 调试复盘：Darwin旧通知再交付

- 根因E/B：[原生 #19](https://github.com/DenisZheng/NexaTerm/actions/runs/38991353217)的重复窗口回归稳定复现；测试探针给出peek=true、errno22、mark=false、pending=None。这是已消费OOB之后，又按旧通知尝试读取，不是对当前真实pending控制的正常WouldBlock。
- 前次机制只在消费后清monitor的Cell，EV_CLEAR只处理已交付的一轮。读取mark前段仍可能把旧NOTE_OOB再次排入内核filter；旧fflags在后续普通数据事件上再交付。
- 一手核对：[Apple XNU xnu-10002.1.13 uipc_socket.c](https://github.com/apple-oss-distributions/xnu/blob/xnu-10002.1.13/bsd/kern/uipc_socket.c)的soexcept_filtops复用soread filter，filt_soread_common按位置设置NOTE_OOB且也可因普通数据返回事件；结合实际探针，定位为旧filter状态未清。仅阅读，未复制外部代码。
- 修复在真实MSG_OOB消费成功后，同一次kevent变更删除并重建所属except filter，再清Cell；重新attach会检查当前socket，新urgent可继续交付。注册错误保持固定IoFailed，没有把EINVAL吞成Idle。
- 防复发：macOS保留32轮完整窗口请求/resize/普通数据回归，既有重复readiness/peek、精确flush和ACK接管断言继续执行。临时errno生产模块测试探针已删除，仅保留无payload的测试失败状态上下文。具体契约已同步legacy-native-sockets.md，无模板源镜像。

## 后续接入点

下一阶段接typed IPC和app管理：复用 `xdmcp_runtime.rs` 的实际WebviewWindow核验；在lib的main窗口Destroyed与RunEvent::Exit处取消并等待所属worker，不能依赖托管状态Drop。将pull/ACK/epoch映射到typed响应，输出不得经过无界emit或SessionLogs。Windows精确flush缺口仍保持完整能力关闭。

DNS仍需从解析前共享原15秒截止，并为不可中断解析保留真实worker配额；当前只接受数字IPv4。IPC/UI/主题、真实rlogind互通、Windows精确flush与完整协议入口仍待完成，当前不是只剩人工验收。

## 全量门禁附带修复：XDMCP夹具PID发布

CI632的macOS library523通过/1失败；失败为xdmcp native natural/failed exit用例的ParseIntError::Empty，生产回收状态断言此前已过。根因D/E：测试子进程每10ms用fs::write截断并重写同一PID文件，实际group/job结束可能把进程杀在truncate和write之间；存在文件不等于PID已完整发布。

修复夹具生产端：同目录暂存完整PID，再rename为就绪标记；只发布一次，取消循环重写。父进程在启动replacement前撤销旧标记，兼容Windows目标已存在限制。原有PID解析和实际进程终止断言均保留，没有忽略空/坏PID或提高超时。生产XDMCP runner逻辑未改；具体要求已写入xdmcp-runner.md，原生platform harness及完整应用CI继续验证。
