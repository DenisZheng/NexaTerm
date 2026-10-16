# L1 原生 socket 执行证据与边界分析

代码基准：`76ddffecf8b308272ab441c9391922d08b0b8869`；[Draft #69](https://github.com/DenisZheng/NexaTerm/pull/69)，基于 #68。范围是 socket/控制基础，完整 Rlogin 与终端接入尚未交付。

## 已执行证据

[原生 workflow #8](https://github.com/DenisZheng/NexaTerm/actions/runs/38932284977)三平台全通过。harness导入生产模块，并核对全部锁定依赖均在应用锁内。L0十项也单独执行，不能重复计算为新增测试。

| Runner | Harness测试 | 实际低源端口结果 | 精确原生flush |
| --- | --- | --- | --- |
| ubuntu-22.04 | 24通过，无skip/ignore | access_denied | mark及前后段正向断言通过 |
| macos-14 | 24通过，无skip/ignore | access_denied | mark及前后段正向断言通过 |
| windows-latest | 25通过，无skip/ignore | available；实际对端所见源端口等于持有的低端口 | 当前adapter不支持；明确错误及全部数据保留断言通过，不是flush互通通过 |

Unix低端口拒绝是真实执行，不是跳过，也不能证明legacy登录可用；不同主机权限/sysctl可能有不同结果。未提权或改用高端口。Windows验证实际低端口连接；三平台均在普通loopback socket验证取消/超时/实际Tokio任务abort后的句柄所有权回收。

[完整应用 CI #620](https://github.com/DenisZheng/NexaTerm/actions/runs/38932285024)：全部7个实际执行job通过；条件Windows打包未触发，不算安装包验收。Rust library：Linux498通过/4个既有ignored、macOS498通过/0ignored、Windows500通过/0ignored；新增legacy_socket/rlogin_native用例均执行通过。其它二进制19项、集成1项及doc测试通过；前端888通过/1todo，类型/构建、脚本/source、安全、许可证、服务fixture检查全部通过。本地无Rust；行数、capability/CSP、YAML/Python、任务manifest与diff检查通过。本地secrets扫描因缺少gitleaks为ENVIRONMENT-BLOCKED，不算通过；已检查暂存差异，上述代码基准的完整CI安全扫描真实通过，收口head仍由自动CI再次扫描。

收口提交只更新文档、注释和一个flush测试名称，生产逻辑/测试断言不变。上述完整CI对应代码基准76ddff；收口head的自动CI是新一次运行，不混写为同一head的证据。

## 调试分析

### 1. 根因分类

E/B：将同名socket操作的跨平台语义默认为相同。真实原生fixture暴露了provider的urgent边界差异，纯字节codec测试不能证明这个契约。

### 2. 前几次修复为什么不完整

锁定libc0.2.189未导出Linux SIOCATMARK，Unix改用文档定义的POSIX sockatmark C ABI，没有硬编码ioctl数字。Darwin原poll的OOB/EOF行为未满足fixture，改为独占kqueue：读filter保持level，EVFILT_EXCEPT+NOTE_OOB设EV_CLEAR，避免消费后重复交付旧urgent标志；EOF只作为read事件。

先peek再消费并未修复Windows：原生探针在OOB仍排队时，一次普通read读到了前后两段，而SIOCATMARK直到消费OOB后才改变；inline模式也未提供可用的位置边界。因此当前adapter在flush时返回sticky UrgentBoundaryUnavailable，既不丢普通数据，也不发成功控制事件；窗口和流控独立工作。这是剩余实现缺口，不是降低产品目标或断言Windows不存在其它可行backend。

取消fixture原先用80毫秒与OS线程调度竞争。独立超时用例仍为80毫秒；取消用例使用已有2秒fixture预算，必须返回Cancelled，删除取消检查仍会失败。生产connect/pending控制15秒与25毫秒轮询均未改变。

### 3. 已落实的防复发机制

P0：实际OOB/普通流/mark转换探针；普通控制值字节透明；Unix精确flush断言；Windows显式负向能力及全部数据保留；重复窗口请求、流控/背压、取消/drop所有权。错误和探针只含固定元数据或自编fixture计数，不含真实用户payload/端点。未复制外部实现。

### 4. 系统性扩展

后续session owner必须将32KiB隔离区计入1MiB输出预算，仅在有效flush事件清理自己尚未交付渲染的输出，串行处理partial write，每代新建reader。主窗口许可、四会话配额、完整握手/ACK合包尾部转移、IPC/UI和真实rlogind仍待开发。Rsh的普通双流可复用低端口所有权，不依赖本urgent mark能力。

### 5. 知识落点

可执行契约收敛于 .trellis/spec/backend/legacy-native-sockets.md 和任务design/implement；本应用无Trellis模板源镜像，不存在第二份src/templates待同步。BSD候选profile限制见 bsd-rlogin-profile.md，资料核对不是服务端兼容性证据。
