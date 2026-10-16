# 原生建立 adapter 执行证据

[Draft #70](https://github.com/DenisZheng/NexaTerm/pull/70)，基于 #69。完整协议能力仍未开放。

## 首轮与调试根因

[原生 #10](https://github.com/DenisZheng/NexaTerm/actions/runs/38935223031)：Linux/Windows各33项全过，macOS32通过/1失败。失败是ACK尾部遇urgent flush的接管场景，不是字段或握手字节编码。

### 1. 根因分类

E/B：把readiness与MSG_PEEK都默认为无副作用查询，忽略了Darwin事件通知与urgent位置状态的不同所有权。

### 2. 为什么前几次修复不完整

EV_CLEAR会清内核一次性通知。首个修复让Monitor保留pending urgent，观察/peek均不清所属pending，只有实际OOB消费成功才清除；重复readiness/peek回归通过，接管flush仍失败（原生#11）。

原生#12探针确认正常read停在mark、ACK尾部只有7字节前段，未吞后段；#13加入消费后的普通read提示仍未修复，已移除该补丁。真正原因在位置状态：Darwin在mark上执行OOB peek也会清掉位置标记，导致之后at_mark为false，reader把后段误认作前段并丢弃，继而等不到应保留的数据。

已核对一手源 [Apple XNU xnu-10002.1.13 tcp_usr_rcvoob](https://github.com/apple-oss-distributions/xnu/blob/xnu-10002.1.13/bsd/netinet/tcp_usrreq.c)：清位置状态发生在是否MSG_PEEK的分支之前。仅阅读源，没有复制或引入外部实现。

### 3. 防复发机制

当前修复：先查mark，已到边界直接消费OOB并发控制事件；未到边界才peek并等待普通游标推进。等待控制字节且已到mark时，禁止读取后段作为前段隔离。保留原接管flush数据断言，以及重复观察/peek、before/after-peek位置探针；不提高截止、不skip、不筛掉生产输出。临时生产模块测试trace已删除，夹具探针只输出固定状态/计数。

### 4. 系统性扩展

所有在既有TCP游标上构造reader的adapter均须验证“正好位于mark”场景，不能只测试前段尚未读取的情况。Monitor随独占socket移动，不向并行reader共享；生产封装消费OOB，不绕过其所属pending状态。

### 5. 知识落点

具体契约见legacy-native-sockets.md、rlogin-connect.md；真实socket接管回归由生产模块harness执行，无模板源镜像待同步。

## 当前结果

代码基准：`0cd5cf53bb2553b35408fccec701d66acb3d0f25`。

[原生 #14](https://github.com/DenisZheng/NexaTerm/actions/runs/38943343620)：三平台各34项全部通过，无skip/ignore；harness导入生产模块，依赖锁子集核对通过。L0十项另外执行，不重复计算为新增测试。

| Runner | 原生harness | 公共建立adapter低端口路径 | 普通socket协议交换 |
| --- | --- | --- | --- |
| ubuntu-22.04 | 34通过 | 实际AccessDenied，无连接/高端口兜底 | 请求/ACK尾部/拒绝/取消/截止/abort；Unix精确flush接管通过 |
| macos-14 | 34通过 | 实际AccessDenied，无连接/高端口兜底 | 同上；探针确认peek前mark=true、peek后false，接管flush正向断言通过 |
| windows-latest | 34通过 | 实际低源端口完成请求、ACK、尾部交付与关闭，端口处于512–1023 | 其它交换与回收通过；精确flush仍不可用，既有明确失败/数据保留断言通过 |

Unix拒绝是真实执行，不是skip，也不代表低端口legacy登录可用。普通socket fixture与真正低端口路径分别留证，均不替代真实rlogind互通；ACK不证明认证/登录成功。

[完整应用 CI #626](https://github.com/DenisZheng/NexaTerm/actions/runs/38943343704)：全部7个实际执行job通过；条件Windows打包未触发，不算安装包验收。应用library：Linux508通过/4个既有ignored，macOS508通过/0ignored，Windows509通过/0ignored；新增用例全部执行。其它二进制19项、集成1项及doc测试通过；前端888通过/1todo，类型/构建、脚本/source、安全、许可证、服务fixture全部通过。

本地无Rust/gitleaks；行数、YAML、capability/CSP、任务manifest和diff检查通过，Rust/完整安全扫描等执行由CI留证。最终收口仅更新文档/任务记录，生产及测试源码均未变；上述执行证据对应0cd5cf5，文档head的自动CI另列。

后续开发入口：research/session-owner-seams.md。Windows精确flush、session owner/队列/许可/IPC/UI、真实rlogind互通仍待完成，不把本次建立adapter当成完整协议交付。
