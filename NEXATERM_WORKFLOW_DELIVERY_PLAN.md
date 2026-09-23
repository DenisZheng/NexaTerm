# NexaTerm：以 MobaXterm 操作流程为主线的开发计划

初版：2026-09-22；修订：2026-09-23（补充 Trellis 文档与上下文治理）  
基线：GitHub main，`45418f37aa69ea965d8c87d1b6056eb06a81a286`；本轮已核对远端，仍为该提交。  
用途：替换现有开发计划的阶段组织方式，并据此修订 Task 04 后续范围和拆分任务。  
性质：详细建议方案；以下 WF 编号和拟新增文件是规划标识，不表示已经创建 Trellis 任务或改动仓库。

**计划的核心调整**

接下来的主线是：用户沿熟悉的入口创建会话、打开终端、管理文件、分屏、批量输入、使用 WSL/X11，并恢复工作区。每个阶段以一段能实际演示的流程结束；安全、测试、架构整理是该流程的交付条件。

原有加固成果继续使用。已经落地的协议、凭据、Host Key、PPK、分屏和测试不重做。全面拆完 WorkspaceShell 不作为进入产品改造的前置条件。

本计划保留原需求对跨平台、X11、恢复、i18n、许可证和数据安全的要求。中途可交付试用里程碑；未满足原 v1 验收时，不把试用版称为完整 v1。

## 1. 从当前进度开始

### 1.1 当前 Task 04 的准确断点

| 切片 | 当前状态 | 下一步处置 |
| --- | --- | --- |
| 1a Split hook 提取 | 已完成 | 保留 |
| 1b Split reducer + live 同步状态 | 已完成 | 保留现有测试；暂不增加超过 4 pane 的能力 |
| 2a SessionTabs types/selectors | 已完成 | 复用；对外标签呈现将在 WF-01 调整 |
| 2b useSessionTabsController | 已完成 | 五类会话集合仍有 useState；shell 内有同步 ref 通道 |
| 2c-1 指针 reducer | 已完成 | 仍保留九个 setter 过渡接口 |
| 2c-2a 激活/记忆 action | 最新提交已完成 | CI run 35600276051 成功；任务中的 CI 留白应更新，GUI 勾选不能用 CI 代替 |
| 2c-2b 关闭/删除 action | 待做 | WF-00 优先收尾，拆成可独立验证的小改动 |
| 第三刀 MultiExec owner 合并 | 待做 | 调整归属到 WF-04，直接服务统一目标和入口，避免先固化旧目标模型再重写 |
| 全部集合合并、全文件拆分 | 未完成 | 只在 WF-01 等流程确实需要时继续，避免成为无限前置任务 |

当前 `WorkspaceShell.tsx` 14,003 行。这个数字说明职责仍集中，但不作为产品完成率或重构验收标准。

当前验证基线可复用：177 个前端测试通过、1 个 todo；脚本测试 62 通过、3 集成测试跳过；前端在 CI 同款 4 GiB Node heap 配置下构建通过；最新提交 Windows/Linux/macOS ARM64 Rust check/test 均通过。本轮代码未变化，因此没有重复运行整套测试。

### 1.2 代码里的五个具体接入点

| 接入点 | 当前真实实现 | 面向目标的改造 |
| --- | --- | --- |
| 顶部标签 | `AppTitlebar.tsx` 接收按 connectionId 分组的摘要；Local 是独立入口 | 将用户打开的每个会话实例作为可选择、可关闭的工作区项；同一保存配置可以打开多次 |
| 新建连接 | `ConnectionDialog.submit()` 保存后关闭；`onSave` 返回 Promise<void>；shell 的 `saveConnection()` 实际已返回保存结果 | 新建主按钮改为“保存并连接”，复用返回的 profile 打开一次会话；编辑默认保存，不自动重连 |
| 快速连接 | Rust `TerminalConnectRequest.connection_id` 可选，已有 host/user/key 直连入口；现有 UI 搜索针对已保存连接 | 新增地址解析和临时会话流程；同时补齐临时连接的 Files 访问上下文 |
| 文件联动 | `RemoteFilePanel` 有 tab 级 stateKey、terminalPath、手动定位、目录请求失效保护；文件 IPC 仍按保存的 connectionId 解析 | 复用缓存与请求保护；让 Files 跟随当前 tab/pane，并为临时会话提供受控上下文 |
| 批量输入 | `buildCommandSenderTargets()` 每个连接选一个子 tab；local 也聚合为一个目标；live 与 send 分散 | 以会话实例为目标，显示主机、用户名、标签名、状态；两种模式共用目标集合 |

另一个不能遗漏的边界：`ConnectionPane` 的树形分组存在 localStorage 中的 parentId，而 SQLite `connection_groups` 和 `SyncConnectionGroup` 仍是平面结构。完整树管理、迁移和导出不能只调整前端。

## 2. WF-00A：先完成规范切换与上下文校准

### 2.1 因果判断：已有冲突证据，尚无历史回退的直接证据

旧 `prototype/light-neutral/mxterm-light-neutral-design.md` 明确要求顶部只表示 SSH 连接、左侧固定连接仓库、文件工具放右侧；`AGENTS.md` 又要求沿用这个原型。`.trellis/spec/frontend/component-guidelines.md` 还限定 Command Sender 的终端子标签工具栏入口等交互位置。这些规则会在新的工作流改造中产生冲突，必须更新其适用范围。

但 Task 04 的 PRD 已明确引用新目标：统一 Home/SSH/WSL/RDP 顶部标签、左侧 Sessions | Files。它同时要求本次状态重构不改变 UI，并把布局另列任务。因此，当前维持旧界面也符合这个具体任务的边界；仅凭仓库不能断定 Codex 曾把一个已完成的新布局回退，更不能把全部原因归于上游 Trellis 文档。

应区分两类问题：继承的旧产品规则仍作为现行约束，以及新的审计/重构任务长期占据主线。前者需要规范迁移，后者需要任务重排。Trellis 的流程和记录机制可以继续使用。

本次确认远端 main 仍为 `45418f37`。只读检出中 `task.py current --source` 返回无绑定；用户开发机上的会话任务指针可能不同，不能据此判断用户没有当前任务。仓库中的 Codex hook 配置也不能单独证明某次历史会话实际执行过该 hook。

### 2.2 实际加载路径：只改一份计划不足以改变执行依据

- 根 `AGENTS.md` 引导读取 workflow/config/任务，要求实现前读取 spec，并要求继续迭代旧原型母版。
- `.codex/hooks.json` 注册 `UserPromptSubmit` 调用 `.codex/hooks/inject-workflow-state.py`。脚本根据活动任务及状态，读取 `.trellis/workflow.md` 的对应提示块；它没有每轮无差别注入所有历史文档。
- 当前 Codex 默认 `inline`。其执行提示要求读取当前任务 `prd.md`、`design.md`、`implement.md`，再由 `trellis-before-dev` 读取相关规范。只更新 JSONL 不能覆盖这条实际主路径。
- `implement.jsonl` / `check.jsonl` 在配置的子代理模式中分别供执行和检查读取；当前 Task 04 的 manifest 仍引用组件规范与原 Task 04 验收。当前主线无需为此开启子代理，但这些已有文件也应保持一致。
- `trellis-start` / `trellis-continue` 与 `get_context.py` 指向当前任务、规范索引和日志位置。日志是历史记录；并无证据表明全部 archive/journal 每轮都会自动加载。

需要同时校准：入口说明、当前任务、规范索引、相关规范和检查依据。优先修内容和引用，只有实际加载仍不符合规则时才改脚本或 hook。

### 2.3 文件处理清单

| 文件/范围 | 处置 | 具体修改 |
| --- | --- | --- |
| `NEXATERM_REQUIREMENTS.md` | 保留目标 | 继续作为产品范围依据，补工作流映射，不把未完成需求删成缩小版 |
| `docs/WORKFLOW_SPEC.md`（拟新增） | 明确当前目标 | 记录已确认的入口、实例标签、Sessions/Files、Split、MultiExec、恢复规则，给出规则编号与适用阶段；未批准提案明确标为待定 |
| `AGENTS.md` | 定点修订 | 明确 NexaTerm 目标和当前规范入口；把复用原型/组件与保留旧布局区分开；旧布局不得被写成永久约束；保留权限、设计确认、测试、凭据、许可与性能要求 |
| `CLAUDE.md` | 修正入口引用 | 当前仅为 `@AGENTS.MD`，实际文件为 `AGENTS.md`；建议统一为准确大小写，避免大小写敏感环境失效。它属于 Claude 入口问题，不作为 Codex 回退的原因 |
| 旧原型设计说明及 HTML | 标注历史、更新母版 | 先明确旧结构哪些被替代，再沿现有母版实现新交互。不要把尚未更新的旧 HTML 标成新工作流验收依据 |
| `.trellis/spec/frontend/index.md` | 接入新规范 | 在适用的 UI/工作区开发必读入口链接 WORKFLOW_SPEC；无需让纯后端或依赖升级任务加载整份 UI 规格 |
| `component-guidelines.md` | 按条拆分 | 保留 Radix/Lucide、token、暗色、可访问性、快捷键、资源生命周期；把 Command Sender 固定入口、右侧文件交互等改为有范围的当前实现说明或新规则引用 |
| `tauri-command-contracts.md` | 保留协议、更新交互约束 | 保留 payload、认证、Host Key、输出顺序、错误和清理契约；把混在其中的旧入口/页面位置约束与真实 IPC 约束分开；新 Quick Connect 的契约随 WF-02 明确扩展 |
| Task 04 的 PRD/design/implement 与 `docs/tasks/04-*` | 收尾与转移范围 | 保留原“不改 UI”作为本重构任务的约束，标明剩余工作去向；新布局另建 WF-01，不让旧任务范围覆盖新的布局任务 |
| 活跃任务的 `implement.jsonl` / `check.jsonl` | 同步执行/检查依据 | 让两端引用同一版相关规范；删除已经被替代的规范性引用，必要历史材料在 reason 中注明用途与非约束性质 |
| `.trellis/workflow.md` 与入口 skills | 小范围补充路由规则 | 在选任务/开工/检查步骤明确核对当前产品规范版本和任务范围；保留既有生命周期。优先通过 artifact 与 index 引用实现，不把整个新产品规格塞入通用 workflow |
| `docs/DEVELOPMENT_PLAN.md` 与 CURRENT_STATE/GAP_ANALYSIS/ARCHITECTURE | 更新语义和事实 | 计划写目标与顺序；CURRENT_STATE 标当前提交和实际行为；ARCHITECTURE 区分现有结构、选定方向和待实现项 |
| `.trellis/tasks/archive/`、旧研究与 journal | 保留并降为历史参考 | 不批量删除；不放入新任务默认必读包；必要时在索引或被引用文档顶部标出已替代范围及替代规范；新日志记录切换结论 |
| 源码检查与行为测试 | 随行为变更同步 | 保留实际安全/生命周期回归门禁；新流程变更时替换旧布局或旧标识符断言，不能让检查器把已批准的新入口自动修回旧位置 |

另外，AGENTS 中 Gitee `origin/master` / GitHub `github/main` 的分支约定、文档中外部产品参照的表述约束，需核对是否仍符合 NexaTerm 的实际开发流程。不能因为改产品布局就自行改发布权限或假定远端命名。内部产品规格应能明确记录用户要求的工作流映射；对外品牌文案、外部代码复用及许可证要求另行遵守。

### 2.4 产品目标、当前实现和历史材料分开标识

建议使用 Markdown 元信息或顶部说明，不擅自扩展 `task.json` 的状态枚举：

- **目标规范**：版本/日期、确认状态、适用范围、关联工作流。只对已确认的目标生效。
- **当前实现说明**：对应 commit、真实行为、与目标的差距。“目前 Files 在右侧”是事实，不等于“以后必须在右侧”。
- **迁移说明**：旧行为、目标行为、承接任务、保留的兼容约束、何时切换验收。
- **历史参考**：形成日期、已替代范围、替代文档，不参与当前产品规则裁决。

同一条具体产品规则只在 WORKFLOW_SPEC 维护正文；AGENTS、spec index 和任务通过链接/规则编号引用，避免复制出多份逐渐不一致的规范。工程规则仍在各自 spec 中维护。文档分工必须在入口规则中同步体现，不能仅新增一个“优先级最高”文件就假定其它约束自动失效。

保留原型母版、token 和共享组件的约束不意味着必须永久保留旧左右布局。Task 04 的“本次不改 UI”也不应升级为所有后续任务的限制。

### 2.5 切换顺序与当前会话处理

1. 核对当前任务和未提交改动，记录 Task 04 已完成切片与剩余工作；这一步不清空运行时目录，不改写历史进度。
2. 将新工作流规则形成可评审版本，并列出每条旧规则保留、替换、移为历史的理由。按现有用户授权和项目设计流程完成对齐。
3. 在同一轮文档变更中同步 AGENTS、规范索引、冲突条款和活跃任务范围，避免一段时间内仍有两个相反的现行规则。
4. 将 WF-00 细分为本节的 **WF-00A 规范切换** 和 **WF-00B 必要关闭生命周期收尾**，再接 WF-01。更新执行/检查所读内容，不提前删除仍适用于旧代码的检查。
5. 使用 Trellis CLI 正常绑定相应任务。新布局开发必须进入它自己的工作流任务，不能仅在旧重构任务中发送“继续”并期待任务范围自动改变。保留 task 历史和未完成项去向，不手改 `.runtime`、模板 hashes 或全局 Trellis 安装目录来达到切换效果。
6. 文档与任务切换后，建议从新会话加载目标任务；若继续原会话，先重新读取修订规范和当前任务，明确哪些旧结论失效。更改磁盘文档不会自动移除长会话里已读入的内容，无需删除全部聊天或工作日志。

### 2.6 WF-00A 的验收标准

- 从当前入口启动/恢复任务后，能明确说出下一项用户流程、当前规范版本、任务范围和验收条件。
- 对“Files 在哪里”“标签代表配置还是实例”“MultiExec 选择什么”三个问题，当前规范与任务给出一致答案。
- 在 WF-01 等新流程任务中，没有仍以现行强制规则引用的“顶部只放 SSH 连接”“文件固定右侧”“所有任务不改 UI”。历史原文可以保留，但范围与替代关系清楚。
- 实现和检查读取一致的目标规则；检查结果能区分有意的交互变更与意外回归，不因旧位置断言而回改新流程。
- `task.py current --source` 指向预期任务；适用时用 `task.py list-context <task>` / `task.py validate <task>` 核对引用。inline 模式还必须核对 PRD/design/implement 和 spec index，JSONL 正确并不能单独证明上下文正确。
- 原有凭据、Host Key、许可证、迁移回滚、资源清理、主题及 lazy-loading 规则仍有来源；不存在为了减少“旧文档影响”而整体移除工程保护的做法。

这项工作的交付是少量规范与引用的完整切换。先处理能影响下一批任务的内容，不做全仓历史文档重写，不删除整个 Trellis。

## 3. 建议采用的产品规则

以下是建议的明确默认值。它们用于让计划可执行；尚未作为仓库当前行为实现。涉及旧交互变化时，应在原型和任务设计中明示。

### 3.1 主窗口与入口

- 顶部菜单按“会话、视图、终端、工具、设置、帮助”组织；高频工具栏包含新建会话、分屏、MultiExec、隧道，以及 capability 可用时的 X11。
- 左侧采用 Sessions / Files 切换；SSH 成功后默认显示该会话的 Files，可切回 Sessions，切换不能重建 SSH。
- 中间以终端和远程桌面为主；远程编辑器继续提供当前能力，在所属 SSH 工作区内部显示。
- Monitor、Docker、AI 等进入次级工具面板；保持按需加载，继续可用，但不占用本轮主功能开发容量。
- 首页保留最近、收藏和快速连接。继承现有紧凑 token、图标和主题，先完成入口与行为，不单独排一轮配色美化。

### 3.2 保存的配置、打开的会话、底层连接分别建模

| 概念 | 示例 | 规则 |
| --- | --- | --- |
| 保存配置 | server-A、Ubuntu profile、COM3 profile | 长期存在；点击可打开多个实例 |
| 工作区会话实例 | server-A / 终端 1、server-A / 终端 2 | 各有独立逻辑 ID、目录、标签状态、关闭行为和 MultiExec 选择 |
| 底层运行时句柄 | Rust terminal sessionId、RDP/VNC runner ID | 可以因重连变化；不作为保存配置身份，不写入恢复快照 |
| 当前上下文 | 活动工作区项 + 活动 pane | 工具栏、Files、状态栏、快捷键从这里派生 |

建议默认把每个打开的会话作为可直接定位的标签，而不是仅显示连接分组再找子终端。分屏后可以显示一个包含多个 pane 的工作区标签，pane 内仍保留独立会话身份。同一会话切换展示位置时不重复连接；明确选择“新建会话”才新建底层连接。

先用 selector 对现有 Terminal/Local/RDP/VNC 集合生成统一视图，不复制出第二份会话数据。标签顺序可以有独立 ID 顺序表，其职责仅是排序。若最终需要统一实体集合，在接入阶段逐项迁移并删除旧 owner。

保留当前 home/settings 与记忆状态的行为测试；不要未经验证就把所有旧指针与 homeActive 宣称为可直接删除的派生值。

### 3.3 新建、编辑与快速连接

- 新建：主操作为“保存并连接”；可选“仅保存”；测试连接是辅助操作。
- 编辑：默认保存配置，不终止或重连正在运行的实例；“保存并新建连接”是显式动作。
- 快速连接：支持 `user@host`、`ssh://user@host:port`，使用结构化解析，不把输入交给 shell 拼接执行。缺少用户/认证时沿用现有认证 UI。
- 快速连接默认临时，会话成功后可“保存为会话”；失败或取消不会留下伪装成正式配置的数据库记录。
- 默认不从 URL 接收密码。IPv6、端口范围、空白及非法输入有明确规则和测试。

### 3.4 文件与终端联动

- Files 绑定活动 pane 对应的 SSH 上下文；同一主机两个终端可以分别处于 `/etc` 和 `/var/log`。
- 提供明确的“跟随终端目录”开关。推荐跟随开启时自动定位；手动浏览到其它目录时清楚显示当前跟随状态，不能暗中反复抢回目录。
- 沿用已有 OSC7/目录识别与手动定位；检测不到目录时保留手动操作，不伪造识别成功。
- 缓存、请求序号、取消/过期响应保护以会话或 pane 上下文区分。标签切换期间 A 的慢响应不能覆盖 B 的列表。
- 上传下载保持现有队列和重试机制；关闭标签时明确处理仍在运行的传输。
- 继续使用 Monaco 与远端 mtime/size 冲突检测；未保存编辑的关闭确认不能在布局调整中丢失。

### 3.5 Split 与 MultiExec

- 首批沿用现有 2/4 pane、横向/纵向、拖动比例；`terminalSplitMaxPanes = 4` 不在本轮扩展。
- 清楚区分“把已打开会话放入 pane”和“为 pane 新建一个会话”。
- MultiExec 共用 `off/live/send` 模型。目标以会话实例 ID 标识，可勾选同一连接的两个终端。
- 推荐显式选择后固定目标集合。切换焦点不暗中更换 send 目标；相比当前 active-tab 同步目标的行为，这是一项有意的产品变化，需要原型和测试。
- live 输入由一个来源分发，避免同一按键经两个监听重复写入。目标断线后失效，重连不会无提示重新加入广播。
- send 结果区分“已写入终端”“写入失败”“目标已断开”。普通 PTY 写入成功不等于远端命令执行成功，也不自动对不确定的批量命令重发。
- 终端快捷键与菜单快捷键统一分发；中文输入法组合态、粘贴、Ctrl+C 等由明确的终端输入规则处理。

### 3.6 其他约束

- Local/WSL 与远程协议共用会话入口和标签呈现，底层继续使用各自已有 provider，不强行塞进 SSH 配置结构。
- 平台不支持或缺 runner 时说明具体原因；RDP external 与 embedded 如实区分。
- X11 必须能实际建立 forwarding 并打开 GUI 才算完成。仅有按钮、DISPLAY 字符串或依赖探测不算交付。
- 恢复快照只记录非敏感配置及引用；重启默认可以恢复布局，自动重连由明确设置控制，MultiExec 不自动恢复为开启状态。

这些默认值以原始需求为主；MobaXterm 官方文档用于核对 Sessions、文件浏览、Split、MultiExec 与目录跟随行为。NexaTerm 的具体快捷键、错误处理及保存策略仍需独立定义，不能宣传成逐项完全相同。

## 4. 以可演示流程重新安排阶段

编号表示交付包，不等于一个巨大 PR。WF-00 至 WF-04 是主线；X11 可行性调研在 WF-01 期间提前做，避免最后才发现 v1 的重要阻塞。品牌、许可证和测试随相关交付推进，不能全部堆到最后。

| 交付包 | 用户能演示的结果 | 主要依赖 | 完成后进入下一阶段的条件 |
| --- | --- | --- | --- |
| WF-00 当前断点收尾与规则对齐 | 原有打开、切换、关闭行为稳定；下一阶段有一致的交互规则 | 当前 main | 关闭/删除 action 迁移完成，关键生命周期验证有证据；原计划范围已迁移 |
| WF-01 主窗口与统一会话入口 | 通过统一菜单/工具栏找到新建、Files、Split、MultiExec；同一主机两次打开可直接定位 | WF-00 | 原型通过现有设计流程；标签、焦点、关闭与 lazy loading 不回归 |
| WF-02 新建与快速连接 | 新建→保存并连接；首页输入地址→临时连接→可保存 | WF-01 的实例与入口约定 | 认证、取消、失败重试和临时文件上下文全部走通 |
| WF-03 SSH 与 Files 日常操作 | 打开 SSH→左侧 Files→跟随目录→编辑/上传/下载 | WF-02，已有 SFTP/编辑器 | 标签/pane 切换不串目录，冲突和传输关闭策略可验收 |
| WF-04 多会话工作 | 树中整理/批量打开→2/4 分屏→选择实例→MultiExec | WF-01、WF-03 | 同主机多实例、混合 SSH/Local、部分失败和断线均处理明确 |
| WF-05 常用协议与平台入口 | 从同一入口打开 Local、WSL、Serial、Telnet、RDP、VNC | WF-01/02，现有 provider | 各平台真实连接矩阵有证据；能力限制可见 |
| WF-06 网络与图形工作流 | 管理隧道、经跳板连接并使用 SFTP、打开远端 X11 GUI | WF-02/03、提前的 X11 spike | 真实 forwarding/跳板链、取消清理、X11 显示验证通过 |
| WF-07 工作区恢复 | 退出→重启→恢复标签/分屏/文件位置→按策略重连 | WF-04 的目标状态模型；相关协议接入 | 版本迁移、部分失败、缺配置和敏感数据边界通过 |
| WF-08 迁移、安装与完整 v1 | 老数据升级后正常使用；三平台安装、更新、语言和性能可验收 | 所有 v1 必选项 | 原需求逐项验证；发行物、第三方声明和更新渠道齐全 |

建议把 WF-01/02/03 完成后的产物定义为“SSH 日常流程试用版”，WF-04 完成后定义为“多会话工作流试用版”。它们不是对原始 v1 范围的削减。

### WF-00：收尾当前 2c-2b，但限制重构范围

**具体修改位置**：`src/features/workspace/sessionTabs/{actions.ts,reducer.ts,useSessionTabsController.ts}`，`src/features/layout/WorkspaceShell.tsx`，Task 04 的 design/implement。

1. 先给当前行为补有意义的 characterization tests：关闭活动/非活动标签、关闭最后一个标签、Home 与最近活动项回落、一个连接存在多个子终端时删除配置、分屏 pane 关闭、连接尚未完成时关闭。
2. 将“关闭后剩什么、激活谁、记忆指针如何变化”收敛到纯 action/reducer 或纯决策函数。现有五类集合不要求在这一包全部改成一种实体存储。
3. 避免在 React state updater 内触发其它 setter、Tauri IPC、Docker exec 清理等副作用。控制器协调一次状态决策，外层按结果执行清理。
4. 保留 `runConnectionStep()` 已有的 `connectingTabExists()` 与晚返回 session 清理；迁移后测试其仍有效。这是现有成果，不重新造一套平行的请求状态机。
5. 当前动作适配器只迁移 2c-2b 涉及的关闭/删除路径，避免扩展到整个 Files/Monitor/Docker/AI 的所有权调整。
6. 将过时的 source-check 规则更新为适用的接口/行为检查；不能为了通过正则检查把职责塞回 shell。已发现的四项旧检查分别处理，不全部解释成产品故障。

原 2c-2b 还混有 WorkbenchTab 联合/ordinal 映射、split anchor 改为 owner ID，以及开始连接、切 pane、settings 返回等调用点。建议把联合与映射放入 WF-01，把 split anchor 调整放入 WF-04；其它调用点随对应流程迁移。九个 setter 只有在确实没有调用者时才删除；不能一边保留调用，一边把“全部删除过渡接口”写成已完成。

**退出条件**：相关 reducer/controller 测试、适用脚本和构建通过；至少一轮真实窗口验证切换、关闭、重连、分屏、未保存文件确认。没有 GUI 环境时保留“未验证”，不能据此声称 Task 04 全部完成。

**本包终点**：关闭生命周期能稳定支撑下一轮 UI。MultiExec 第三刀和其它大块拆分正式转入各自工作流包。

### WF-01：先把入口和会话单位统一

**复用/修改**：现有原型母版、`AppTitlebar.tsx`、`WorkspaceShell.tsx`、`sessionTabs/types.ts` 与 `selectors.ts`、`src/shared/tauri/platformCapabilities.ts`。复用已有 `src/features/shortcuts/shortcutRegistry.ts`、`useShortcutManager.ts` 与快捷键校验，扩展菜单/工具栏需要的动作元数据和可用性，不另起一套快捷键注册中心，也不存第二份会话状态。

1. 在现有原型里展示三种状态：空工作区、一个 SSH + Files、四 pane + MultiExec 目标面板；同时标出窄窗口下菜单/工具栏如何收起。
2. 明确一个保存的连接可产生多个实例。顶层标签使用实例投影；Local 不再只能作为一个聚合入口隐藏全部子终端。分屏工作区项与其中的 pane 引用同一套实例 ID。
3. 菜单、工具栏、上下文菜单和快捷键调用同一动作入口，能力判断集中派生；工具栏中缺少实现的功能显示可用状态及原因，不能点击后静默无响应。
4. English/zh-CN 资源与 OS 快捷键标记在新入口建立时引入，避免本轮再生成一批硬编码中文。旧面板的全量迁移可以留到对应包。
5. 保持重型 RDP/VNC、Monaco、文件工具按需导入；增加一个入口不应把这些模块带入初始 chunk。

**验收**：同一 SSH profile 打开两个终端，再打开 Local、RDP/VNC 中一个可用实例；每个能直接定位，焦点改变后操作作用于正确实例；关闭其中一个不关闭兄弟实例；主题和菜单键盘操作可用。

**范围约束**：此时不重写所有窗口组件，不以统一标签为由重写 RDP/VNC 引擎，也不新增全局状态库。

### WF-02：打通“创建、连接、保存”

**复用/修改**：`ConnectionDialog.tsx`、`WorkspaceShell.saveConnection()` / `saveConnectionFromDialog()` / `runConnectionStep()`，Rust `commands.rs` 的 `TerminalConnectRequest`、`terminal_connect` 和文件上下文解析入口。

拆为两个可独立交付的小包：

- **WF-02A 保存并连接**：让保存结果回到提交编排层；“保存并连接”只创建一次会话，按钮提交中不可重入。仅保存、编辑已有配置、测试连接分别有明确行为。继续复用现有密码/密钥/PPK/凭据与 Host Key 流程。
- **WF-02B Quick Connect**：解析地址并传给现有 Rust 直连能力。给临时连接建立可供终端和 SFTP 使用的 Rust 内存上下文，前端只持不透明引用；保存配置和临时配置通过公共解析入口提供能力。需要认证材料时沿用受控凭据处理，不能把完整密码复制到 workspace/localStorage，也不能靠自动插入一条伪保存记录让文件 API 工作。

临时上下文需要定义：所属逻辑实例、认证材料的生命周期、重连时是否重新询问、关闭后何时释放、活动传输/编辑操作如何收尾。这里复用已有 SFTP manager，是否复用同一个 SSH transport 由现有 backend 能力决定；工作流不依赖承诺单连接复用。

“保存为会话”成功后把该实例关联到新 profile，不隐式重复连接。Host Key 首次确认、变化拒绝、密码错误、密钥口令、用户取消都有独立结果；失败不污染最近成功记录。

**验收**：空配置库输入地址，完成认证，能打开终端和 Files；保存后重启能在 Sessions 找到；取消时既无残留数据库记录也无孤立连接。结构化地址解析覆盖 IPv6、端口和非法输入。

### WF-03：将已有 Files 能力放入日常操作路径

**复用/修改**：`RemoteFilePanel.tsx`、`remoteFilePanelStrategy.ts`、`TerminalPanel.tsx` 的 OSC7/目录识别、shell 的 Files 编排、现有远端文件编辑器和传输队列。

1. 从 `RemoteFilePanel` 当前混合的 files/monitor/AI/commands/tools 容器中抽出可复用的文件视图。只把 Files 视图接到左侧；其它工具保留次级入口。
2. descriptor 的来源从“右侧面板是否展开、哪个 rightTool、哪个 activeTab”改为“Files 是否可见 + 活动 pane 的 SSH 上下文”。保留 tab 级缓存与请求失效防护。
3. SSH 成功后默认展示 Files；已保存与临时 SSH 行为一致。非 SSH 激活时显示该协议实际可用的文件能力/说明，不残留上一台主机的可操作文件列表。
4. 目录跟随状态按实例保存。检测到目录事件且跟随开启时定位；手动浏览建议暂停跟随并给出恢复按钮，避免后台事件反复打断文件浏览。
5. 复用远程编辑、上传、下载、重试；明确编辑器归属与未保存确认。保持 mtime/size 冲突检查，不把已有检测宣传为绝对不会覆盖。
6. 文件操作状态与 pane 生命周期分离到合适边界：传输存在时关闭会话按既定策略询问或继续托管；任何策略都必须防止视图关闭后操作无人管理。

**验收**：同一主机两个 pane 分别位于两个目录，来回点击焦点后 Files 正确；A 的延迟响应不能覆盖 B；远端文件在编辑期间被修改时有冲突提示；断线/重连后目录与错误状态合理；窄窗口能切回终端。

### WF-04：会话树、分屏与 MultiExec 成为一条流程

**WF-04A 会话树数据一致性**

修改 `ConnectionPane.tsx`、`storage_sqlite.rs` / 现有 repository 与 migration、`sync_snapshot.rs`、`connection_transfer.rs`。沿现有 group_id 扩展规范分组模型，定义 parent_id、排序、必要的视觉属性；验证祖先环、孤立引用、删除父组与同名规则。

现有 SQLite 全局唯一 name 与树形目录下的同名组存在设计冲突，必须明确允许范围再做 schema。把 localStorage 的旧 parentId 树导入规范存储时保留备份、映射与冲突处理；更新同步/导入导出版本。不能只增加一个前端树层，让重启、换机或导出后丢失层级。

**WF-04B 从树批量打开与分屏**

文件夹提供“连接全部”，有有限并发和逐实例状态；部分认证失败不回滚已成功会话。取消只处理本批尚未完成的连接，不误关用户原有会话。是否递归包含子组由规则明确，建议默认包含且预览数量。

复用 `workspace/split`、`TerminalSplitSurface.tsx` 与 `TerminalSplitMenu.tsx`，保留 2/4 pane 和比例拖动。支持把已打开实例放入 pane，也能明确选择新建实例；一次命令的焦点目标唯一。

**WF-04C 统一 MultiExec**

把 Task 04 第三刀和 Task 06 的批量输入部分放进这一包。修改 `workspace/multiExec/{actions.ts,reducer.ts}`、shell 的 `buildCommandSenderTargets()`、live 输入路由与 Command Sender UI。

目标列表按会话实例生成，不再按 connectionId 每组只选一个。只显示当前能接受终端输入的实例；包括 SSH/Local，以及验证过输入契约的 Serial/Telnet，RDP/VNC 不伪装成终端广播目标。

统一 `off/live/send` 与目标集合所有权，兼容现有可复用历史/快捷命令。live 做单路径路由；send 逐目标报告写入结果；目标变化、关闭和断线通过同一实例生命周期更新。与现有自动跟随活动子 tab 的差异要作为有意变化记录。

**验收**：从一个含三项的组批量打开，其中一项失败；将两个成功实例与另一个 Local 放入分屏；选择目标发送一次；只有所选实例各收到一次。额外覆盖同一主机的两个终端、切焦点不换目标、一个目标断线、Ctrl+C、粘贴与中文输入法。

### WF-05：把已有协议带入统一入口

**复用/修改**：现有 `ConnectionProtocol`、`ConnectionDialog` 与运行路径；`src-tauri/src/terminal/local_profiles.rs`；`platformCapabilities.ts`；RDP/VNC 的既有 provider。

- Local/WSL 使用已有 profile 探测和启动能力。`local_profiles.rs` 已处理 WSL 分发版探测与输出编码，下一步重点是入口呈现、发行版选择、缺 WSL 提示以及标签/分屏整合。
- Serial/Telnet 已有实现，沿现有 LocalTerminalTab source 适配目标模型。Serial 验收需要真实设备或明确记录的模拟串口；不能用 SSH 测试代替。
- RDP 保留 Windows embedded、其它平台 external 的真实差异；VNC 复用现有 noVNC/bridge。统一错误、取消、退出清理和标签状态即可，不等待所有平台同一种嵌入方案。
- 能力对象区分平台、依赖是否存在、可用模式和失败原因。工具栏/会话对话框从这里决定可用入口。

**验收**：Windows 验证 WSL 与 embedded RDP；macOS/Linux 验证各自 local profile、external RDP 和 VNC runner；关闭标签后进程和桥接连接正常清理。跨平台支持结论必须有对应运行证据。

### WF-06：隧道、跳板与 X11 分开交付

**WF-06A 隧道管理**：复用 `TunnelPanel.tsx` 与 local/remote/dynamic 隧道实现及 stopped/starting/running/failed/credential_required 状态。补齐顶部入口、配置与启动状态的关联、端口冲突和凭据缺失处理，以及连接关闭时的资源生命周期。不要重做已存在的状态枚举。

**WF-06B Proxy/Jump**：现有单跳实现保留。任务必须显式覆盖原 v1 要求的多跳；当前限制或拒绝嵌套不能算多跳完成。拆为连接计划、每跳认证与 Host Key、取消/超时清理、终端与 SFTP/隧道的一致路由，先验证现有 SSH backend 的组合能力。每一跳失败能定位到具体节点且释放已建立的中间资源。

**WF-06C X11**：在 WF-01 期间先做可行性 spike：核对当前 russh 版本的 X11 请求/通道接口、认证 cookie 和本地 X server 接入；记录三平台分发与许可证约束、性能及缺失项。先产出真实转发最小演示，再排正式集成工作。

外部 X server 方案可用于阶段验证。如果原 v1 要求 Windows 开箱即用，则必须交付满足分发/许可证约束的依赖或安装方案；仅提示用户自行安装不能自动算同等验收。不得因为等待 RDP 统一引擎而阻塞 X11，也不采用禁止许可证来省略评估。

**验收**：经两级跳板进入目标主机，终端与 Files 都正确；本地/远程/dynamic 隧道做真实连接测试；X11 打开远端简单 GUI，认证失败/取消时资源清理。当前代码未证明 X11 已可用。

### WF-07：在目标会话模型上恢复工作区

可在 WF-01 定义非敏感快照契约，持久化实现放在 WF-04 后；避免先保存旧的 connection-group/tab 结构再推倒迁移。

**拟新增边界**：`src/features/workspace/restore/` 的 schema/序列化/恢复规划模块，以及 Rust 现有 storage/migration 的工作区快照入口。路径为建议，并非仓库已存在文件。

快照至少包含：版本、profile 或非敏感临时目标引用、逻辑实例 ID、工作区项顺序、pane 结构与比例、活动项、Files 目录/跟随设置和侧栏状态。不要持久化底层 sessionId、SSH 密码、私钥正文、X11 cookie 或开启中的广播状态。

建议先恢复布局壳，再按设置恢复连接；恢复某项失败不会阻止其它项。缺少配置、WSL 分发版消失、外部 runner 不存在、旧凭据失效时呈现可重试状态。Host Key 仍走现有检查，不能因“恢复”跳过。

临时会话可以恢复非敏感地址，但认证重新取得。未保存远程编辑器内容如要恢复，必须单独定义安全存储和冲突策略；首版可明确只恢复文件引用并保留关闭前的未保存确认，不偷偷宣称支持草稿恢复。

**验收**：SSH 两个实例、Local/WSL、分屏与 Files 布局重启后可辨认并按设置重连；一个连接失败、一个 profile 被删除时其它项正常；旧版本快照迁移失败能回滚；MultiExec 默认关闭。

### WF-08：从试用版走到可发布 v1

以下事项不是等到本阶段才开始：

- **许可证**：Task 02 的 inventory、MPL 文件通知、第三方 notices 在引入/分发组件时同步完成；首次可分发安装器前完成 THIRD_PARTY_LICENSES，保留原 MIT 与第三方许可证边界。
- **品牌与更新**：当前仍存在 mXterm/syscryer 标识与更新地址。逐项盘点包名、窗口名称、bundle identifier、数据目录、MCP 路径、签名及更新 endpoint；保留旧数据迁移映射，避免简单全局替换。NexaTerm 安装包发布前必须使用自己的受控发布渠道。
- **i18n**：WF-01 建基础，各功能包接入新文案，本阶段清理余下界面和错误/日期格式，完整验收 English/zh-CN。
- **验证**：每个流程已有行为测试和 smoke，本阶段再跑 10 SSH + Split + SFTP + Transfer + Monitoring、长时使用、升级回滚及完整平台矩阵。

当前 CI 成功是有价值的工程证据，但 Windows 包装 job 在本次 push 被跳过，不能推导安装包已通过。npm/Rust advisory 审计为 report-only，也不能由 CI 绿灯推导无漏洞；保留现有受控接受记录，随依赖变化复核，不把已经处理的全部事项再开成前置项目。

**最终验收**：原需求中 v1 必选项逐项关联可复现证据，三平台 build/run/安装、更新、数据升级、许可证、基础性能都有结果。无法满足的项明确标记缺口；若要改变 v1 范围，需要产品层明确变更，不让开发计划静默删除。

## 5. 现有 Task 00—09 如何迁移

| 原任务 | 当前成果如何保留 | 新归属与处理 |
| --- | --- | --- |
| 00 baseline/toolchain/evidence | 保留已有工具链、基线与 CI 证据 | 更新同提交证据即可，不重做完整基线阶段 |
| 01 security/dependency | 保留已归档加固、CSP/capabilities 检查及受控接受 | 残余真实窗口/平台验证与 IPC/MCP 约束跟随相关包；发布前检查适用门禁 |
| 02 license | 保留盘点工作，补缺失 notices | 持续任务；新增分发依赖先评估，首次安装器前交付完整声明 |
| 03 frontend tests | Vitest/行为测试基础已经存在 | 完成基础任务收尾；后续测试归对应流程包，不要求先为全应用补齐测试 |
| 04 workspace seam | 保留 Split、selectors/controller、指针与激活 action | 2c-2b→WF-00；统一实例标签→WF-01；Files 边界→WF-03；MultiExec 第三刀→WF-04 |
| 05 restore/schema | 保留设计研究与迁移方向 | 快照契约随 WF-01，正式实现→WF-07；不先固化旧标签结构 |
| 06 MultiExec/network | 复用现有命令发送、单跳、代理 | MultiExec→WF-04；网络→WF-06；多跳单列，修正现任务与原 v1 范围的遗漏 |
| 07 capability/RDP/VNC/X11 | 复用已有 provider、RDP/VNC runner 研究 | capability 与入口→WF-05；X11 spike 提前，正式实现→WF-06；不等待统一 RDP 内核 |
| 08 i18n/brand/release | 保留现有品牌迁移原则 | 新入口 i18n→WF-01 起；各流程文案随包；品牌/更新与完整发布→WF-08 前完成 |
| 09 performance/stability/E2E | 保留完整场景和阈值 | 行为/集成验证分配到各包；全量性能、长稳与安装升级→WF-08 |

Trellis 操作建议：保留原任务与设计历史，在 implement 里写“剩余范围迁移至 WF-xx”，新建对应有用户验收的子任务。父任务只有在已完成部分和迁移部分都有可追踪去向后才能收尾。Task 03 的 administrative in_progress 与测试基线已完成应对齐；不把 Task 04 第三刀直接打勾。

原需求中的 FTP、Mosh、第三方会话导入仍按原优先级处理。若第一批真实用户主要从 MobaXterm 迁移，可以单独把会话导入提升优先级：先识别格式和无秘密字段，提供导入预览与冲突规则，再决定是否进入首批试用版；本计划不默认扩大该范围。

## 6. 验收清单：每条都对应可观察结果

| 编号 | 操作 | 可观察的通过条件 | 所属包 |
| --- | --- | --- | --- |
| A01 | 连接中立即关闭，再等待异步结果 | 不出现幽灵标签/连接；迟到 session 被关闭 | WF-00 |
| A02 | 同一保存配置打开两次，关闭其中一次 | 另一实例保留，活动项与 Files 指向正确 | WF-01 |
| A03 | 新建→保存并连接；连续点击提交 | 只保存一次并打开一个会话，错误可恢复 | WF-02A |
| A04 | 空配置库 Quick Connect→Files→保存 | 终端和文件均可用；保存后可复用；取消不留伪记录 | WF-02B |
| A05 | 两 pane 进入不同目录并快速切换 | Files 跟随焦点；过期目录响应不覆盖当前视图 | WF-03 |
| A06 | 编辑后远端另行修改，再保存 | 给出冲突处理；关闭未保存编辑有明确行为 | WF-03 |
| A07 | 建嵌套组、移动、导出/导入、重启 | 层级与关联保留，无丢组、环或名称冲突静默覆盖 | WF-04A |
| A08 | 对含成功与失败项的文件夹连接全部 | 逐项结果可见，取消/失败不误关原有会话 | WF-04B |
| A09 | 2/4 分屏→选择两个实例→live/send | 目标各收到一次；未选实例不收到；切焦点不暗换目标 | WF-04C |
| A10 | 一个广播目标断线，再重连 | 状态更新，不自动重发未知结果命令，不无提示重入广播 | WF-04C |
| A11 | 打开 WSL/Serial/Telnet/RDP/VNC 并关闭 | 各自平台行为真实；退出释放句柄/runner | WF-05 |
| A12 | 两级跳板→SSH + Files；测试三类隧道 | 路由一致，失败定位正确，关闭后无资源残留 | WF-06 |
| A13 | SSH X11 打开远端图形程序 | 真实显示与交互；凭据和通道生命周期正确 | WF-06 |
| A14 | 多会话分屏重启，一项失效 | 布局恢复，其它会话可用，失败项可重试，广播关闭 | WF-07 |
| A15 | 老版本数据升级、安装并检查更新 | 数据保留，更新指向 NexaTerm，声明和语言完整 | WF-08 |

每条验收记录四个维度：实现状态、自动化证据、真实连接证据、平台与环境。只做 mock 的组件测试不能标记真实协议互操作已通过。

测试组织以行为边界为主：纯状态/解析/迁移使用 unit；对话框提交、标签选择、Files 切换用组件或集成测试；SSH/跳板/SFTP/X11/设备/runner 使用受控真实环境 smoke。只为当前改动和具体剩余风险补测试，不为文档、样式小改或函数搬家机械新增测试。

## 7. 从当前提交开始的前五个执行任务

### 执行 1：WF-00A 规范切换与上下文校准

交付：按第 2 节同步入口、冲突规范、任务和执行/检查引用；Task 04 写明优先收尾的 2c-2b 边界，其 MultiExec 第三刀与 Task 06 批量输入部分合并至 WF-04。原型信息架构按现有流程确认后再实现，继续复用母版。此任务无需改产品运行时行为。

完成定义：仓库里不再同时出现“左侧固定连接/右侧固定文件”和“Sessions/Files 左侧”的互相覆盖约束；任务能追溯下一次用户可见交付。

### 执行 2：关闭/删除的纯决策与回归证据

范围：为当前关闭行为建立覆盖，再落地 2c-2b 决策/action。暂不改顶部布局、协议和存储。保留 Home、记忆指针与最后一项回落规则。

完成定义：关闭活动、非活动、最后一个、同 profile 多实例、分屏 pane 均有明确状态结果；不在 updater 中做外部副作用。

### 执行 3：关闭编排接入与生命周期验证

范围：把 shell 对关闭/删除的调用接入控制器，处理实际 terminalClose/runner/工具清理；保留请求完成前标签已关闭的既有保护。执行适用 CI 与真实窗口检查，修正本次触及的过时检查。

完成定义：A01/A02 当前行为通过；Task 04 的剩余范围正式迁移，结束“先把整个大文件拆完”的前置依赖。

### 执行 4：统一入口与实例标签的第一版

范围：在已对齐原型上接入菜单/工具栏、基本 i18n、当前实例投影与统一动作入口。可先接 SSH 和 Local，再按 provider 渐进扩展；先形成稳定公共契约。

完成定义：同一 profile 两个终端可以直接选择和关闭，焦点/操作对象一致；现有 lazy load 与主题无回归。X11 spike 可在独立任务进行，不阻塞这次窗口改造。

### 执行 5：新建会话“保存并连接”

范围：改 `ConnectionDialog` 与 `saveConnectionFromDialog` 的提交契约，新增主/次动作，复用当前 `saveConnection` 返回值与连接编排。失败、取消与重复提交处理齐全。

完成定义：A03 通过，用户第一次能通过新入口完成保存与连接。随后直接推进 WF-02B 临时上下文与 Quick Connect，再接 WF-03。

以上是顺序，不承诺固定人日。当前尚缺的多平台真实验证、X11 可行性与群组迁移复杂度会影响工期。先以这五个任务验证交付速度，再估算后续包；不要在缺少运行证据时用一个总体百分比或固定发布日期替代风险判断。

## 8. 防止计划再次失焦的执行规则

- 每个新任务必须写出一句用户流程和对应验收编号。纯重构任务注明它解锁哪一条流程，以及明确终点。
- 不把 WorkspaceShell 行数下降、组件数量、source-check 数量作为主里程碑。关注用户从入口到结果是否完成。
- 在 WF-04 前冻结 AI/Monitor/Docker 新功能、大主题改版、任意层数分屏及统一 RDP 内核；已有能力继续维护，阻断目标流程的缺陷正常修复。
- 每个流程包保留必要的安全、许可、数据迁移和平台门禁；已经完成的加固证据复用，避免按阶段重新展开整个安全工程。
- PR 尽量只跨一个行为边界：实例视图、关闭动作、临时连接上下文、Files 布局、群组迁移、MultiExec 路由分别提交。数据迁移与新 UI 可以相邻交付，但各自有可回退边界。
- 先写“现有模块复用什么、这个包改变什么、如何验收”，再决定是否提取新模块。遵守已有 workspace reducer/controller 约束，不平添第二套会话事实来源。

## 9. 证据与参考

以下源码链接固定到评审提交，便于之后区分代码变化与本次建议；它们支持“当前进度”事实，不意味着建议已经实现。

- [当前 Task 04 design](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/tasks/09-19-workspace-shell-state-seam/design.md)、[implement](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/tasks/09-19-workspace-shell-state-seam/implement.md)：切片进度与未完成范围。
- [WorkspaceShell.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/layout/WorkspaceShell.tsx)、[sessionTabs](https://github.com/DenisZheng/NexaTerm/tree/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/workspace/sessionTabs)：当前状态、关闭、目标生成与连接编排。
- [AppTitlebar.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/layout/AppTitlebar.tsx)、[旧原型约束](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/prototype/light-neutral/mxterm-light-neutral-design.md)、[AGENTS.md](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/AGENTS.md)：标签粒度与布局规则。
- [ConnectionDialog.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/connections/ConnectionDialog.tsx)、[commands.rs](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src-tauri/src/commands.rs)：保存行为、直连能力和文件配置解析边界。
- [RemoteFilePanel.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/files/RemoteFilePanel.tsx)、[remoteFilePanelStrategy.ts](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/layout/remoteFilePanelStrategy.ts)：现有文件视图与挂载策略。
- [ConnectionPane.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/connections/ConnectionPane.tsx)、[storage_sqlite.rs](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src-tauri/src/storage_sqlite.rs)、[sync_snapshot.rs](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src-tauri/src/sync_snapshot.rs)：组层级持久化差异。
- [local_profiles.rs](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src-tauri/src/terminal/local_profiles.rs)、[TunnelPanel.tsx](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/src/features/tunnels/TunnelPanel.tsx)：已有 WSL/Local 与隧道能力。
- [原需求](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/NEXATERM_REQUIREMENTS.md)、[现开发计划](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/docs/DEVELOPMENT_PLAN.md)、[最新提交 CI](https://github.com/DenisZheng/NexaTerm/actions/runs/35600276051)：需求、原排序与验证证据。
- [Task 04 PRD](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/tasks/09-19-workspace-shell-state-seam/prd.md)、[组件规范](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/spec/frontend/component-guidelines.md)、[Tauri 契约](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/spec/frontend/tauri-command-contracts.md)：当前任务“不改 UI”的范围与混合在工程规范中的交互限制。
- [Trellis workflow](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.trellis/workflow.md)、[Codex hook 配置](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.codex/hooks.json)、[before-dev skill](https://github.com/DenisZheng/NexaTerm/blob/45418f37aa69ea965d8c87d1b6056eb06a81a286/.agents/skills/trellis-before-dev/SKILL.md)：已核对的项目内上下文加载路径；不代表历史会话执行日志。
- [MobaXterm 官方文档](https://mobaxterm.mobatek.net/documentation.html)：Sessions、SSH 文件浏览、2/4 Split、MultiExec、SSH 路径跟随及 X11 的产品参照。目录跟随在官方文档中有适用环境限制；本方案保留手动操作路径。

评审限制：本轮以当前源码、任务记录、既有本地测试和远端 CI 为依据，没有执行真实 Tauri GUI、远程服务器、串口硬件或三平台现场操作。所有 WF 验收均是后续交付要求，不是已通过的测试。
