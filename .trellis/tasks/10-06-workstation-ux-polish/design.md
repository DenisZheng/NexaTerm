# 设计与官方工作流审计

## 官方依据（2026-10-06）

- https://mobaxterm.mobatek.net/
- https://mobaxterm.mobatek.net/features.html
- https://mobaxterm.mobatek.net/documentation.html
- https://mobaxterm.mobatek.net/download-home-edition.html

官网当前列 26.4；26.1 记录 Session tree 已打开标记及点击跳转；26.0 记录 Quick Connect 直接开启 live session。Documentation 列出 folder 批量启动、multitab / 2 terminals / 4 terminals 与 Multi-execution。SSH 工作流描述连接后左侧出现 graphical browser。

实际查看官方 SFTP / MultiExec 功能截图；图内含 2012 年内容，不能当作 26.4 当前像素依据。图片只放临时目录，不进入仓库或产品。仅使用信息组织与可发现性结论；不复制图片、icon、文案、皮肤、自动保存策略、shell 命令解析或全终端广播语义。

## 差距表（实施前已输出）

| 官方工作流 | 当前实现 | 差距 | 优先级 | 建议 | WS |
| --- | --- | --- | --- | --- | --- |
| 主窗口 Quick Connect | 搜索弹窗内有真实临时连接 | Home 入口不直接 | P0 | 轻量表单复用 parser 与认证 | E07/C03–C06 |
| SSH browser + terminal | Files 左侧且按 pane 隔离 | 缺可见实例归属 | P0 | 同 Tab 标题、地址、状态、pane | M03/E04/F01/F05 |
| 广播状态及退出 | 已有 ACTIVE/Stop/Live/Send | 固定目标规则不明显 | P0 | 目标摘要、固定集合提示、输入源 | X03–X08 |
| Tree 已打开标记与跳转 | 树与 Tab 身份独立且正确 | 缺打开数量与定位 | P1 | 只投影实例，显式跳转 | M01–M05/E11–E13 |
| 高频工具栏 | 统一 action executor | 重复广播占位、搜索作用域/折叠不理想 | P1 | Quick Open、顺序/宽度/活动提示 | E01/E03/E08/E10 |
| 分组与常用文件操作 | 分组、批量预览、Files 动作完整 | 展开/批量入口与动作顺序不突出 | P1/P2 | 小量呈现调整 | G01/X09/F06 |
| 2/4 terminals | 布局与 picker 已完整 | 焦点主要靠样式 | P1 | 文本焦点与输入源 | M03/X01/X02 |

## 技术选择

- 打开会话展示投影复用 `selectWorkspaceItems(..., null)` 和 `buildTitlebarItems`。不新增身份存储；跳转复用已有 activate 函数，其已支持 Split 内定位。
- Home 表单只持地址草稿，调用已有 parser / callback；不新增 IPC、认证或保存路径。
- Files 沿用 resolver / stateKey / 异步保护；header 只读实例事实。
- MultiExec 不保留断线目标副本。有效集合仍由现有 controller 决定，UI 提示断线移除及重连需重选。
- Toolbar 同 registry / executor；X11 尚无可执行 toolbar handler 时留在菜单显示原因，不新建伪动作。
- 使用 ui-ux-pro-max 的状态不能只靠颜色、键盘焦点可见原则；落到既有 token 与共享控件，不生成新设计系统。
- Tabs 已有实例 ordinal、协议角标、活动项固定与 overflow；右侧不暴露 Files，工具有 capability 空状态，Tunnel 行展示配置归属。本轮不重画这些区域。
