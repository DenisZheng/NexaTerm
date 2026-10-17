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

执行代码基准：`d3a259961f5a682893b20056522f785869fea9f9`。

[原生 #18](https://github.com/DenisZheng/NexaTerm/actions/runs/38991164357)：Linux49、Windows48通过；macOS48通过/1失败，session owner新增用例全过，但既有native_oob_window用例在普通读取阶段返回IoFailed。新增macOS重复窗口控制回归和仅测试状态/errno探针继续定位；尚未标记最终通过。[完整应用 CI #630](https://github.com/DenisZheng/NexaTerm/actions/runs/38991164427)运行中，后续修正会以新代码重跑。旧代码CI因后续测试修正而取消，不复用为最终完整证据。

本地任务manifest、行数、diff、workflow YAML、Tauri capability/CSP检查通过；本机无Rust/gitleaks，原生编译与完整安全扫描以CI结果为准。harness只增加应用lockfile已有的uuid pin，无应用依赖/lock变更。

## 后续接入点

下一阶段接typed IPC和app管理：复用 `xdmcp_runtime.rs` 的实际WebviewWindow核验；在lib的main窗口Destroyed与RunEvent::Exit处取消并等待所属worker，不能依赖托管状态Drop。将pull/ACK/epoch映射到typed响应，输出不得经过无界emit或SessionLogs。Windows精确flush缺口仍保持完整能力关闭。

DNS仍需从解析前共享原15秒截止，并为不可中断解析保留真实worker配额；当前只接受数字IPv4。IPC/UI/主题、真实rlogind互通、Windows精确flush与完整协议入口仍待完成，当前不是只剩人工验收。
