# WF-01 设计草案：主窗口与统一会话入口

> 状态：**决策草案**（2026-09-23，WF-00B 代码完成后起草）。§3 的决策项未经维护者确认前不开工；确认后回写 `docs/WORKFLOW_SPEC.md`（WS-E02 / E06 / E08 及本草案新增的待确认项）并升版，再按 §4 切片实施。
> 依据：`prd.md`、`docs/WORKFLOW_SPEC.md` WS-M / WS-E / WS-R01、`NEXATERM_REQUIREMENTS.md` §29–§37、当前代码事实（§1）。

## 1. 当前代码事实（2026-09-23，`d722bf5`）

| 项 | 事实 |
| --- | --- |
| 顶部标签数据 | `WorkspaceShell` 第 1282 行 `connectionSessions = useMemo(...)` 用 `selectConnectionSessions` 把终端 / RDP / VNC **按 connectionId 合并**，`AppTitlebar` 收到 `TitlebarConnectionSession { connectionId, tabs: {id}[] }[]`；一个连接一个标签，子终端在标签内；Local 由 `localTerminalActive` 单独表示，是一个聚合入口。 |
| 标签回调 | `onSelectConnectionSession(connectionId)`、`onCloseConnectionSession(s)`、`onCloseOther…`、`onCloseAll…`、`onOpenHome`、`onOpenLocalTerminal`、`onToggleLeftPane`；溢出时有 `TitlebarSessionSwitcher`（body 门户 `⋯` 菜单，component-guidelines 已规定该机制）。 |
| AppTitlebar | 832 行，41 处硬编码中文；macOS 自绘 traffic lights、Windows 自定义窗口按钮均在此文件。 |
| 指针状态 | `SessionPointerState`：`activeConnectionId` + 四个类型专属指针（tab / rdp / vnc / local）+ `mode` + `homeActive`；没有"活动工作区项 id"这一概念（WS-M03 需要）。 |
| 集合 | 五个 useState（terminalTabs / localTerminalTabs / rdpSessions / vncSessions / remoteFileTabs）；无顺序表，标签顺序 = 集合插入顺序按连接分组。 |
| 快捷键 | `shortcutRegistry.ts` 8 个动作（connection.quickOpen、settings.open、terminal.newTab / closeTab / search.*、commandSender.toggle）；有 `useShortcutManager` 与冲突校验；无菜单 / 工具栏元数据（label、icon、enabledWhen）。 |
| i18n | `package.json` 无 i18n 依赖，`src/` 无 i18n / locale 目录；文案全部硬编码中文。 |
| 原型母版 | `mxterm-light-neutral.html` 1,103 行：`.shell` 为 `左栏 224 | 6 | 主区 | 6 | 右栏 330` 五列 grid；右栏 `.file-pane` 含"文件 / 传输 / 监控"标签；状态切换靠 `:target` 锚点（`#right-collapsed`）。顶栏 `.connection-tabs` 直接是连接标签。 |
| 左栏 | `.connection-pane`：固定（最近 / 收藏）+ 分组 + 快速访问；没有 Sessions / Files 切换。 |

## 2. 目标形状（已确认部分，来自 WORKFLOW_SPEC）

- 顶层标签 = 会话实例投影（WS-M02）；同一 profile 可多实例；Local / WSL / RDP / VNC 与 SSH 同一套标签。
- 当前上下文 = 活动工作区项 + 活动 pane（WS-M03）；工具栏可用性、Files 绑定从这里派生。
- 投影用 selector 从五个集合生成，不复制数据；顺序用独立 ID 顺序表（WS-M05）。
- 统一动作入口：菜单 / 工具栏 / 上下文菜单 / 快捷键同一动作表，复用 `shortcuts/`（WS-E01、WS-E10）。
- 左侧 Sessions / Files 切换壳（WS-E04）；Files 视图本身 WF-03 再抽。
- 新入口文案走 i18n（WS-E09）；重模块不进首屏（WS-E10）。
- 定义非敏感快照契约类型（WS-R01），不持久化。

## 3. 需要维护者决定的项

每项给出选项与推荐；推荐基于原需求 §33–§35 与当前代码成本。

| # | 决策 | 选项 | 推荐 | 影响 |
| --- | --- | --- | --- | --- |
| D1（WS-E02） | 菜单分组 | A. 需求 §34：File / Sessions / View / Terminal / Tools / Settings / Help；B. 方案 §3.1：会话 / 视图 / 终端 / 工具 / 设置 / 帮助（无 File，导入导出归会话，偏好归设置） | **B**。File 菜单在本产品只剩导入/导出/退出，塞进"会话"更贴合桌面运维工具；Windows/macOS 均无原生菜单栏（自绘 titlebar），少一个菜单省宽度 | 菜单动作表结构 |
| D2（WS-E06） | 次级工具面板位置 | A. 保留右侧可收起面板（Monitor / Docker / 命令库 / AI / 隧道），Files 移到左侧后右侧只剩工具；B. 右侧面板整体取消，工具改为工具栏"工具"菜单打开的浮层 / 底部抽屉；C. 右侧面板保留但默认收起 | **A（默认收起改为 C 视窄窗口而定）**。改动最小、`RemoteFilePanel` 的 monitor/commands/tools/ai 容器可原地保留，WF-03 只抽 files 视图；B 会把 Monitor/Docker 的布局也拖进本包，违反 WF-04 前冻结 | WF-03 的抽取范围；原型第二状态 |
| D3（WS-E08） | 窄窗口收起 | A. 工具栏按优先级折叠进 `⋯`，菜单栏保留；B. 菜单栏折叠为单个"≡"按钮，工具栏保留图标；C. 两者都折叠 | **A**。菜单栏是发现入口，工具栏是高频快捷方式，高频的先折叠可接受 | 原型窄窗口状态 |
| D4（新） | 实例标签标题 | A. `名称 · 终端 N`（沿用现有 ordinal）；B. `名称` + 同名时加序号；C. 用户可重命名标签 | **A**，C 留待后续 | selector 输出、i18n key |
| D5（新） | 分屏工作区项的标签 | A. 一个标签代表整个分屏组，标题为宿主实例，pane 内实例不再单独出现在顶栏；B. 每个 pane 实例仍各有标签，点击任一标签切到该分屏组并聚焦对应 pane | **A**（WS-M04 已按此写为默认值；B 会让标签数与 pane 数重复） | 顺序表与分屏 host 的关系 |
| D6（新） | Local / WSL 标签 | A. 每个本地终端实例一个标签，与 SSH 并列（WS-M02 字面要求）；B. 保留一个"本地"聚合标签，子终端在内部 | **A**。这是本包的核心变化之一；B 就是现状 | `localTerminalActive` 退役 |
| D7（新） | i18n 实现 | A. 引入 `react-i18next`（MIT，约 40 kB）；B. 自建最小 `t(key, params)` + JSON 目录 + `useLocale`，无依赖 | **B**。需求 §41 只要 en / zh-CN 与新文案入 i18n；自建 100 行内可满足，不增加首屏依赖，后续如需复数/ICU 再换 | 许可证清单不新增条目 |
| D8（新） | 原型状态机制 | A. 沿用 `:target` 锚点（纯 CSS，无 JS）；B. 允许原型内少量 JS 切换状态 | **B**。三种状态 + 窄窗口 + 菜单展开靠锚点会爆炸，母版 AGENTS 条目本就要求"可点击的伪功能" | 原型实现方式 |

`ui-ux-pro-max` 技能在本会话不可用；原型评审需要在有该技能的会话完成，或由维护者按 component-guidelines 的桌面工具风格人工评审。

## 4. 实施切片（决策后再定稿）

1. **原型**：在母版 HTML 上实现三种状态（空工作区 / 一个 SSH + 左侧 Files / 四 pane + MultiExec 目标面板）+ 窄窗口；提交 `docs: prototype unified session entry states`；评审通过后回写 WORKFLOW_SPEC。
2. **实例投影**：`sessionTabs/instances.ts`（`WorkspaceItem` 联合 `home | ssh | local | rdp | vnc | split`，`selectWorkspaceItems(collections, order)`）、`order: string[]` 顺序表进 `SessionPointerState`（新增 / 关闭时维护）、`activeItemId` 派生 selector；承接 Task 04 顺延的 `WorkbenchTab` 联合与 `ordinal`。纯函数 + 测试，shell 不变。
3. **顶栏改实例标签**：`AppTitlebar` props 从 `connectionSessions` 改为 `items: WorkspaceItem[]` + `activeItemId`；溢出机制沿用；`localTerminalActive` 退役；回调改为 `onSelectItem(itemId)` / `onCloseItem(itemId)`。
4. **动作表**：`shortcuts/actionRegistry.ts`（id、label key、icon、group、`enabledWhen(context)`），菜单栏 / 工具栏 / 上下文菜单 / 快捷键都从这里取；未实现动作显示 disabled + 原因 tooltip。
5. **左侧 Sessions / Files 切换壳**：`ConnectionPane` 外包一层切换；Files 位置先放占位（绑定活动 pane 的 connectionId，显示"WF-03 接入"说明），不搬 `RemoteFilePanel`。
6. **i18n 基础**：`src/shared/i18n/`（`t`、`useLocale`、`en.json`、`zh-CN.json`），新入口全部走 key；设置页加语言切换。
7. **检查脚本**：随 3 / 4 更新 `check-command-sender-active-tab-source.mjs`（预存失败，改为断言动作表）、`check-workspace-ssh-activation-source.mjs`、`check-session-subtab-memory.mjs` 等。
8. **快照契约**：`workspace/restore/snapshotTypes.ts` 只定义类型与 `toSnapshot(state)` 纯函数（不含 sessionId / 密码），有测试；不落盘。

每片一个提交；3 之后需要一次真实窗口验证（同 profile 两终端 + Local + RDP/VNC 可直接定位、关一个不影响兄弟）。

## 5. 风险

- `AppTitlebar` 与 shell 之间 20 余个 props 全部要换，回归面大；靠切片 2 的纯函数测试 + 切片 3 的一次真实窗口验证兜底。
- 顺序表与五个集合并存会有"集合有、表里没有"的不一致窗口；selector 对缺失项按集合顺序补尾，并加测试。
- 自建 i18n 后续若要复数 / 日期本地化，需再评估依赖；先只做字符串与参数插值。
