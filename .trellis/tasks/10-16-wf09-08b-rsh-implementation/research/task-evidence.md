# Rsh S2任务与实际命令界面证据

日期：2026-10-18。唯一父任务仍为09-23-nexaterm-workflow-mainline，沿原10-16 Rsh任务开发。[Draft #81](https://github.com/DenisZheng/NexaTerm/pull/81)堆叠在#80。验证代码为 `44529a022af7fb0310568219b57be344147c2791`；后续收口仅更新文档/任务记录，生产代码、依赖和workflow与tested SHA一致。S2已开发交付，整个任务保留in_progress，真实rshd/Unix低端口正向和WebView验收后置。

## 实际交付

“新建会话 → Rsh远端命令”创建独立瞬态任务。本次许可冻结准确命令/目标/用户/编码；输入原样发送，EOF排在已接受输入后，信号固定BSD1/2/3/9/15；双输出公平背压、分别EOF，单flight精准u64 ACK。初始ACK不表示命令成功；EOF和取消均不生成exit0或远端进程终止证明，重跑需用户再次明确运行和许可。

共用小型lease/registry、严格编码和有界OS DNS；应用内Rlogin/Rsh共享4worker和4DNS额度，各16瞬态handle。实际FD/命令/输入/DNS结束后才完成close/Exit。Rlogin专属urgent/flush/resize不复用于Rsh；Windows exact_flush没有改成可用。没有新增schema、依赖、客户端或提权。

React提交显示后才ACK；每流显示有界，满时暂停且需用户明确清空，不自动截断。binary原样保留，可按准确hex查看。显示阻塞时每次仅一个非消费status请求、一个250ms timer和一个renderer完成观察，报告传输结束/剩余输出draining，不积累无界回调。取消不排在输出或信号后；close等待晚到reserve/start以及stdin/EOF/signal IPC，清理失败保留任务和重试关闭。

命令/输入/输出/许可/运行UUID不进入保存连接、快照、历史/宏、AI或MultiExec。公共PTY关闭、复制/分屏和自动恢复也不能误操作或重跑Rsh。typed DTO拒绝未知字段、宿主数字信号及非规范u64；实际Tauri wrapper从main窗口取身份，不接受前端owner。

## 自动化结果

[完整CI660](https://github.com/DenisZheng/NexaTerm/actions/runs/39130614824)：前端、Linux/macOS/Windows Rust、fixture、安全、许可七执行作业全部SUCCESS；条件package为既有skip，不算打包验收。Rust lib Linux616通过/4既有ignore、macOS617通过/0ignore、Windows616通过/0ignore；各平台binary19、integration1、doc0。前端139文件1160通过/1既有todo；脚本191通过/3既有环境skip。新增测试均实际执行，无新增ignore/skip/todo。

[原生41](https://github.com/DenisZheng/NexaTerm/actions/runs/39130614270)：wire各10；core Linux120、macOS121、Windows119，全三平台SUCCESS且0ignore。新增S2十九项Rust测试覆盖生产双socket actor/二进制双流与晚尾部、stdout背压下另一流/输入/信号/取消继续、半关闭排序、真实FD回收/abort、租约/共享Rlogin配额、晚start/实际OS DNS归属、typed DTO/信号/u64/unknown exit code。

| 执行 | job |
| --- | --- |
| 原生 Linux / macOS / Windows | 117684836229 / 117684836007 / 117684836198 |
| 完整Rust Linux / macOS / Windows | 117684837739 / 117684837577 / 117684837625 |
| 完整前端 | 117684837594 |

独立harness不编译Tauri注册和保存配置调用处。CI658暴露共享DNS抽取后的旧调用error.code编译遗漏；4482bba补齐显式SessionError映射并已过CI659全七项，最终代码再次过CI660；没有跳过门禁或将该代码问题归因为环境。前端共享byte校验保持for-of逐项验证，稀疏数组仍被既有Rlogin回归拒绝。

## 本地与UI证据

本地类型、1160前端测试、191脚本测试、构建、启动/i18n/快照/MultiExec/权限/CSP/行数/diff/Trellis上下文通过。首次build在默认2GiB JS heap达到上限，沿用CI的NODE_OPTIONS=--max-old-space-size=4096原命令通过；未修改依赖、锁文件或门禁。Rsh runtime约8.8kB、pane约9.9kB为独立chunk，没有进入首屏。

同一HTML母版先形成可点击模拟流程，沿用共享Radix/Lucide/AppSelect/token和中英双语。实际生产构建在Chromium打开新建Rsh：亮色、显式暗色、system-dark下pane clientWidth=scrollWidth=664px，主体文字/背景分别随token变化；900px探查viewport中pane为404px，无pane横向溢出。应用既有1100px最小宽度未改，900px不作为整窗窄屏支持证据。pane允许纵向滚动，clientHeight892/scrollHeight949。QA图片为临时文件，不冒充WebView或真实协议验收。

## 权限与互通边界

原生41的Windows保留主连接/listener/callback正向继续通过；Linux/macOS当前非特权进程如实AccessDenied，不外推为其低端口正向。S2 owner夹具使用生产S1 RshTransport上的普通loopback双socket，证明任务IO/背压/生命周期；不冒充真实rshd或所有平台权限可用。

真实rshd、Unix低端口权限集成及三平台WebView/三主题原生互通尚未验收。后续在授权隔离目标记录profile、权限、大输出/独立尾部、stdinEOF/信号、超时/取消/断网、两实例/关闭/重跑，不把未验证项写成PASS。按维护者安排统一验收；下一开发仍有Windows Rlogin精确flush及XDMCP发行组件/打包/桌面接入。保持Draft，不合并/发布，不动#12/#54。
