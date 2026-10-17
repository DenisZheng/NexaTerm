# Rlogin 主窗口 IPC 与应用生命周期执行证据

本轮代码基准：`ae8644ee3d26c15d6da183ee2930409d6dabee63`；[Draft #72](https://github.com/DenisZheng/NexaTerm/pull/72)，基于 #71。本地无 Rust 工具链，Rust 执行以 CI 实际日志为准。

## 实现边界

- 九项实际 main 窗口命令，所有 owner 来自注入的 WebviewWindow；配置在 reserve 时校验并冻结，start 只接受规范 UUID-v4。拒绝 DTO 多余字段，不接收密码或凭据引用。
- epoch/sequence 在 JSON 中使用规范十进制字符串，覆盖超过 JavaScript 精确整数范围和 u64::MAX；原始数据使用字节数组。无配置/输入/输出 Debug 日志或公共 terminal emit。
- status 只读元数据，不取走尾部输出、不释放 ACK 额度或移除句柄；read 继续服从原 owner 的单帧、背压和 flush epoch 契约。
- main 销毁关闭准入并取消；Exit 显式 shutdown_wait，等待实际 socket 关闭、额度归还和 worker 完成通知，不持 registry 锁跨 await。
- Windows 由于缺少精确 urgent 边界，在 reserve/start/read/write/resize 之前固定报 unavailable；capability 仍区分 native_core、runtime、terminal、DNS，status/cancel/close 可用于清理。

## 回归范围

新增九项测试：六项生产 IPC 边界/DTO 测试，三项真实 socket 生命周期测试。包括未知字段与非字节数据拒绝、规范十进制计数、数字 IPv4/许可/profile、平台门禁、非主窗口、状态和错误投影、重复 status 保留 EOF 尾部与无效 ACK 不释放额度、被门控的实际 starting socket 持有额度直至真实完成，以及 main/foreign 销毁区别。

TCP 是字节流，EOF 尾部回归逐帧累积并精确 ACK，不假定一次 write 对应一个输出帧。被门控 worker 通过真实连接与 WouldBlock/最终 EOF 同时证明等待前后的句柄状态，不通过仅检查 cancel 标志冒充清理完成。

## 执行结果

- 本地 line-budget、Tauri capability/CSP、五项 capability policy 单测、任务上下文校验和 diff 检查通过。
- 原生 [#23](https://github.com/DenisZheng/NexaTerm/actions/runs/38995284463)：三平台全部通过，新增九项在各平台通过，均无 skip/ignore；另有独立 L0 wire 各10项全通过。依赖锁子集核对均通过。

| 平台 | 生产模块 harness | 新增 IPC / 生命周期 | ignored / filtered |
| --- | --- | --- | --- |
| Linux | 58 passed | 9 passed | 0 / 0 |
| macOS | 59 passed | 9 passed | 0 / 0 |
| Windows | 57 passed | 9 passed | 0 / 0 |

- 完整应用 [CI #635](https://github.com/DenisZheng/NexaTerm/actions/runs/38995284424)：全部7个实际执行job成功，条件打包job未触发。三平台Cargo check/test通过，新增九项在完整应用中也全部通过。

| 平台 | 应用 library 测试 | ignored / failed |
| --- | --- | --- |
| Linux | 532 passed | 4个既有ignored / 0 |
| macOS | 533 passed | 0 / 0 |
| Windows | 532 passed | 0 / 0 |

各平台其它二进制19项、集成1项、其余0项测试及doc-test均通过。前端类型/构建、112个测试文件888通过/1既有todo、脚本179通过/3环境限定skip及全部source gates通过；安全与许可证门禁、真实SSH/X11/双跳/隧道fixture与文件服务回归均通过。不将既有ignored/todo/条件打包未触发改称实际执行通过。

本轮新增Rust测试无ignore/skip；未延长截止、放宽数据/ACK/EOF断言或降低已有门禁。后续收口只更新文档、规范和任务元数据，生产源码、测试及workflow保持该代码基准，不能把文档收口的新SHA替代为已运行代码SHA。

## 尚未交付

终端 UI、编码/按键/渲染交付接入、DNS、Windows 精确 flush 和真实 rlogind 互通仍待开发/验收；真实 WebView 的负向 IPC 与三主题验收后续统一进行。本轮不是完整 Rlogin 终端可用证明，也不算 Rsh 或内置 X server 已实现。
