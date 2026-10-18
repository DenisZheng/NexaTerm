# WF-09 开发交付与统一验收

更新：2026-10-18。唯一主线仍为 `09-23-nexaterm-workflow-mainline`。依据维护者连续开发至09完成、后续统一验收的授权，所有成果保留为堆叠 Draft PR；不合并、不发布，不变更 PR #12/#54。

## 后续范围变更：三个协议计划实现

维护者于2026-10-16要求先写三个协议的实际功能计划，再授权开发。[三协议实现计划](plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)及ROADMAP是扩展实现的当前入口。XDMCP仍缺随包X server/打包/桌面接入；Rlogin已有实际终端与DNS入口，Windows精确flush仍待开发；Rsh的S0/S1及S2任务owner、typed IPC和实际命令任务界面已进入Draft #79/#80/#81，最新code44529a0已过完整CI660/原生41三平台，真实互通统一后续验收。下表保留此前批准的评估范围，不能用来推定三个协议都已完成或只剩验收。

## 开发成果

| 项目 | 已交付范围 | PR / 自动化证据 |
| --- | --- | --- |
| 01 SFTP | 本地文件面板、传输调度与关闭生命周期 | #58，83db4bf，CI582 SUCCESS |
| 02 远程编辑器 | 保存、另存为与编辑器生命周期 | #59，5b63cde，CI584 SUCCESS |
| 03 凭据库 | 凭据边界与锁定/解锁生命周期 | #60，542edbd，CI586 SUCCESS |
| 04 宏 | 命令录制、敏感输入边界与显式回放 | #61，d9b82f9，CI589 SUCCESS |
| 05 终端增强 | 搜索、会话日志、实时日志与关键词规则/高亮 | #62，a0f032a，CI594 SUCCESS |
| 06 连接诊断 | 有界 DNS/TCP、结构化 SSH 失败定位、本地端口检查 | #63，c1dda4e，CI600 SUCCESS |
| 07 XDMCP | 可行性评估、三平台阻塞证据和复现步骤 | #64，7dc35d6，CI601 SUCCESS |
| 08 Rlogin/Rsh | 评估及暂缓原生 provider 的决策 | #64，7dc35d6，CI601 SUCCESS |
| 09 内置服务 | 单文件只读 IPv4 回环服务、临时认证、Tools UI、停止/退出清理和有界审计 | #65，fc7d1ad，CI603 SUCCESS |

2026-10-16 已逐项查询 #58–#65：均 open/Draft、未合并、mergeable；依赖顺序为 main → #58 → #59 → #60 → #61 → #62 → #63 → #64 → #65。早先 CI 仅证明相应提交；第九项代码提交 fc7d1ad90ad4a59f7cf9814108d59adece97daa3 已通过 [CI603](https://github.com/DenisZheng/NexaTerm/actions/runs/38858276717)，七个执行作业全部 SUCCESS，打包作业按工作流条件跳过。后续交付记录提交仅更新文档/任务元数据，代码验证对象保持为该提交。

07/08表中的历史交付只证明当时评估完成，不替代后续协议实现。扩展实现最新进度以ROADMAP和三协议实现计划为准；Rsh S2具体证据见 [任务记录](../.trellis/tasks/10-16-wf09-08b-rsh-implementation/research/task-evidence.md)。Windows Rlogin精确flush和XDMCP随包组件仍有开发工作，不写成已完成。

## 第九项回归与边界

仅绑定127.0.0.1，一个服务、一个文件读取 worker、四个 HTTP 请求，16 MiB 内容上限、15分钟寿命。每次生成独立随机令牌；GET/HEAD 固定 /file，拒绝请求体、Origin 和非规范路径。错误/审计不包含内容、路径或令牌。复制下载命令需用户明确操作，不执行命令。

CI602 首轮 macOS/Windows Rust 通过，Linux 同端口释放测试失败；原因是已完成 HTTP 的 TIME_WAIT。修复为 Unix SO_REUSEADDR（不启用 SO_REUSEPORT，Windows 不改默认设置），增加实际 manager 同端口重启回归。另一个失败为测试说明第26行的 generic-api-key 误报；仅登记规则/文件/完整源码 SHA256，并测试任一字段或内容变化即不再豁免，保留全历史与当前源码扫描。不能把首轮失败记为通过。

最终代码 CI：前端112个测试文件、888通过/1既有todo；脚本179通过/3环境限定跳过；三平台 Rust、集成 fixtures、安全与许可证全部通过。八项新增文件服务 Rust 测试均通过，Linux 同端口释放/重启回归已验证。最终本地定向13通过，类型/构建及源码门禁通过。本地没有 Rust 工具链，三平台执行由未降级的 CI 完成。

## 后续统一验收（尚未通过）

| 范围 | 必须保留的实机检查 |
| --- | --- |
| 文件与编辑器 | 真实 SSH/SFTP 目标、传输失败/取消/关闭、冲突和原子保存、编码与另存为 |
| 凭据与宏 | 原生凭据后端、锁定/重启、敏感命令不记录、真实终端回放与中断 |
| 终端与诊断 | 原生终端滚动/输入、ANSI 与高亮、日志文件、真实 DNS/SSH 多跳失败和端口冲突 |
| 内置服务 FS01–FS07 | 原生 picker/IPC/clipboard、真实下载、认证拒绝、同端口重启、离开面板/关闭窗口/退出清理、审计可见性 |
| 平台与外观 | Windows/macOS/Linux，各亮色/暗色/system-dark；GUI、权限与 OS 文件行为 |
| 协议评估后续 | X server/真实 XDMCP 目标、许可证/分发条件；Rlogin/Rsh 按新计划推进原生实现与目标互通 |

这些检查统一后续进行，不用单元测试或 CI 编译替代。此前 A15 安装、签名、升级回滚等发布缺口也不因 WF-09 开发而自动关闭。

Windows Rlogin续作见Draft [#82](https://github.com/DenisZheng/NexaTerm/pull/82)及[原生API证据](../.trellis/tasks/10-16-wf09-08a-rlogin-implementation/research/windows-urgent-evidence.md)：代码99bffa6/原生45三平台通过，证明本轮接收API组合仍不能定位精确边界，Windows能力继续关闭，不能记为协议功能完成。
