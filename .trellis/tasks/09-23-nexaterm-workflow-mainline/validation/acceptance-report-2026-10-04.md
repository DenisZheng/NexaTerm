# A01–A15 验收报告（2026-10-04）

> 验收代码：`feat/wf07-workspace-restore` @ `3ff0c8e`（CI #304 SUCCESS），包含 WF-04C/05/06/07 各包实现。
> 验收方式：维护者在 Windows 11（10.0.26300 x64）真实 Tauri 窗口人工操作；环境与日志由 Codex 会话准备。
> 记录来源：本报告由 Codex 会话 `01a1002b`、`01a1053e` 的转录恢复（该会话在结果落盘前中断），并结合运行时现场清单 `.trellis/.runtime/combined-acceptance-2026-10-04.md`。所有 PASS 均为维护者现场确认，助手未独立观察 GUI。
> MultiExec 后续更新：`feat/wf04c-multiexec-entry` 基线 `53eca97` 上的未提交实现已接入顶层底栏，本地自动化和浏览器 UI 通过；尚无本轮真实 Tauri PASS。见 `10-04-wf04c-multiexec-entry/validation/entry.md`。

## 总览

| 编号 | 项目 | 状态 | 证据落点 |
| --- | --- | --- | --- |
| A01 | 关闭/删除生命周期 | **通过**（维护者确认 2026-10-04） | 本报告"集中验收"节；延迟 SSH 幽灵会话检查 |
| A02 | 统一会话实例/入口 | **通过**（维护者确认 2026-10-04） | 本报告"集中验收"节 |
| A03 | 保存并连接 | 通过（既有记录） | `10-01-wf-02a` task.json：真实 GUI 8/8，PR #23 |
| A04 | Quick Connect | **通过**（维护者确认 2026-10-04） | 本报告"集中验收"节 |
| A05 | Files 跟随/隔离 | 通过（既有记录） | `10-01-wf-03` implement.md；`docs/research/wf03-real-tauri-acceptance.md` |
| A06 | 编辑冲突 | 通过（既有记录） | 同上 |
| A07 | 会话树数据一致性 | 通过（macOS） | 归档 `validation/a07.md`；Windows/Linux 仅 CI 自动化证据 |
| A08 | 批量打开 / Split | 通过（既有记录） | `10-02-wf-04b/validation/a08.md`（2026-10-03） |
| A09 | MultiExec live 固定目标 | **本地入口已接入，真实 Tauri 待验** | `10-04-wf04c-multiexec-entry/validation/entry.md`；真实清单见 `10-03-wf-04c-unified-multiexec/validation/a09-a10.md` |
| A10 | MultiExec 断线/重连 | **本地入口已接入，真实 Tauri 待验** | 同上 |
| A11 | 协议/平台矩阵 | **通过**（维护者确认 2026-10-04） | 本报告"集中验收"节 |
| A12 | 隧道 + 两级 Jump | **通过**（维护者确认 2026-10-04） | 本报告"集中验收"节 |
| A13 | X11 真 GUI | **通过**（维护者确认 2026-10-04） | 本报告“A13”节；`10-03-wf-06c-x11-core/A13_EVIDENCE.md` |
| A14 | 工作区恢复 | 通过（既有记录） | `10-04-wf-07/A14_EVIDENCE.md`（两轮 Windows 重启，A14-01～15） |
| A15 | 迁移/安装/完整 v1 | **未开始** | 属 WF-08，任务未创建 |

## 2026-10-04 集中验收（A01/A02/A04/A11/A12）

### 环境（现场记录）

- WSL Ubuntu-24.04 原生 OpenSSH：`127.0.0.1:2222`，`testuser` + `tests/fixtures/keys/test_key`（Ed25519 指纹 `SHA256:Xp1TTC8uNKEoOKikxDGUdY2TlIzi62xijdKJ1RJ1tlg`）。
- A01 延迟入口：`127.0.0.1:2225`（上游连接延迟 3000ms，实测约 3206ms）。
- Telnet 回显：`127.0.0.1:2323`（无认证，banner 与双向字节已实测）。
- Docker fixture（前台 compose）：X11 SSH `2223`、两级 Jump 外层 `2224`、RDP `3389`、VNC `5901`。

### 验收内容

- **A01**：关闭活动/非活动 SSH、关闭最后一个标签回首页、同 profile 两个终端只关一个、Split 中关闭 pane；重点为"连接中立即关闭，等待异步结果不复活幽灵会话/迟到 session"。
- **A02**：同一 SSH profile 两个独立实例、Local/WSL 实例、顶层标签直接定位、关闭不影响 sibling、切换焦点后 Files/动作作用于当前实例。
- **A04**：Quick Connect 建立真实临时 SSH；缺认证时 prompt / Host Key 流程；Terminal 与 Files 可用；"保存为会话"后当前终端原地关联正式 profile（不重复连接），Sessions 可见。
- **A11**：Local/WSL（同 distro 两实例、shell PID 退出检查、关闭回收）、Telnet 双向 I/O 与 sibling、RDP/VNC fixture 客户端连接与关闭清理；Command Sender send 路径记录为通过（不扩展为顶层 MultiExec live 已通过）。
- **A12**：两级路线 `Jump-2 → Jump-1 → Target`（Terminal 与 Files 均走最终 Target）；Jump-1 用户名破坏时错误精确定位到 Jump-1；Jump-1 prompt 凭据正确续接；Local / Dynamic SOCKS / Remote 三类隧道真通，停止后无残留。

维护者现场确认（+0800）："01-04通过"（13:12）、"A11过了"（13:26）、"A12过了"（13:35）。

### 证据边界

- 以上 PASS 来自维护者 GUI 实测反馈；助手（Codex）未取得窗口控制，未独立观察操作。
- 依赖环境的细分项（A11 的 Serial 与 macOS/Linux 平台项、A01/A02 的 RDP/VNC 部分）在现场记录中另有环境限制说明；本报告按维护者最终确认口径记录。

## A09 / A10（入口已本地接入，真实 Tauri 待验）

2026-10-04 后续：`10-04-wf04c-multiexec-entry` 已补齐顶部能力门控、底栏、显式实例选择、Live/停止和 Send 接线；69 文件 / 531 测试及本地构建通过，浏览器三主题与四实例交互通过。该改动尚未提交，不能作为合并或真实终端验收证据。以下保留最初阻塞诊断：

- 现象：顶层 `terminal.multiExec` 入口灰置，无法进入 A09/A10 流程。
- 根因（现场核验）：`src/features/shortcuts/actionRegistry.ts` 将该 action 标记为 `deferred: "deferred-wf04c"`；`src/features/layout/AppActionBar.test.tsx` 固定"显示延期原因且不执行"的行为，定向 UI 测试 13/13 通过，灰置为预期行为而非故障。
- 底层 `src/features/workspace/multiExec/` 的 reducer / targets / live / send 已实现并有自动化证据（`10-03-wf-04c/validation/a09-a10.md`），缺的是顶层入口接入。
- Command Sender（send 路径）已由维护者单独确认通过；按现场结论，不能以 Command Sender 替代统一 MultiExec 的 A09/A10 判定。
- 下一步：在包含本地入口改动的真实 Tauri 窗口中，按 `a09-a10.md` 清单验收；A09/A10 未获维护者 PASS 前保持待验。

## A13（2026-10-04 通过）

> 2026-10-04 下午更新：Windows X11 环境已补齐（VcXsrv 21.1.16.1 + xauth + ssh-x11 fixture，链路预检通过），维护者重试确认 **PASS**；环境与证据见 `10-03-wf-06c-x11-core/A13_EVIDENCE.md`。以下为先前失败诊断，保留作记录。

- 现象：连接报错，诊断 ID `74ac051b-ab68-45db-9bad-d38866298b01`。
- 后端日志：`app_error code=terminal_x11_prepare_failed`；失败发生在**本机 X11 准备阶段**，尚未进入 SSH 连接、认证或远端 sshd。
- 现场诊断：`DISPLAY` 未设置（Windows 回退 `localhost:0`）；系统找不到 `xauth`；`127.0.0.1:6000–6002` 无 X server 监听；A13 fixture `127.0.0.1:2223` 可达。结论：验收机缺少 Windows X11 环境，不是 SSH 连接代码缺陷；代码在缺少环境时按设计 fail closed。
- 恢复条件（现场给出）：1) 安装并启动 X server；2) 提供可被 NexaTerm 找到的 `xauth.exe`；3) `xauth list` 能返回对应 display 的 MIT-MAGIC-COOKIE-1；4) `127.0.0.1:6000` 处于监听；5) profile 启用 X11（DISPLAY 可留空或 `localhost:0`）；6) 重启 App 后重试。
- 可改进点（现场记录）：失败提示过于笼统，可明确指出"缺少 xauth / 未检测到本地 X Server"。

## A15

WF-08（迁移、安装与完整 v1）尚未创建任务，A15 未开始。

## 记录边界与后续动作

- 本次集中验收在 Codex 会话中进行，结果未在会话中断前落盘（`01a1053e` 于 2026-10-04 13:56 被中止）；本报告为其恢复记录。
- 运行时现场清单：`.trellis/.runtime/combined-acceptance-2026-10-04.md`（未提交，仅环境与进程线索）。
- 2026-10-04 已同步：`a11-*.md`×3、`a12-tunnels.md`、`10-03-wf-06c-x11-core/implement.md`、`A13_EVIDENCE.md`。
- 后续动作：1) 审核本地 MultiExec 顶层改动并验收 A09/A10；2) 通过后推进 A15（WF-08 建任务）。`ROADMAP.md` 已按本次证据更新当前工作流进展。
