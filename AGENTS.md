# mXterm Agent 规则

## 产品方向与规范入口（2026-09-23 起）

- 当前开发主线：**以 MobaXterm 操作流程为参照的统一工作流**——统一会话入口与实例标签、左侧 Sessions / Files、SSH 与文件联动、分屏、统一 MultiExec，以及后续 WSL、X11、隧道和工作区恢复。交付包顺序与验收清单（A01–A15）见 `NEXATERM_WORKFLOW_DELIVERY_PLAN.md`，任务地图见 `.trellis/tasks/09-23-nexaterm-workflow-mainline/prd.md`。
- **产品交互规则只在 `docs/WORKFLOW_SPEC.md` 维护正文**（规则编号 `WS-xx`，状态分已确认 / 默认值 / 待确认）。AGENTS、spec index、任务 PRD 只按编号引用，不复制正文；`待确认` 的细节实现前必须先对齐，不得写成已批准。产品范围依据仍是 `NEXATERM_REQUIREMENTS.md`。
- 三个基准问题以 WORKFLOW_SPEC §9 为准：Files 目标在左侧 Sessions / Files 切换并绑定活动 pane；顶层标签代表**会话实例**而非保存配置；MultiExec 以**实例**为目标。"文件固定右侧""顶部只放 SSH 连接""所有任务都不改 UI"**不是**全项目约束：前两条是旧原型说明中已被替代的条目（替代表见 WORKFLOW_SPEC §11），第三条只约束 Task 04（`09-19-workspace-shell-state-seam`）本身。
- 区分四类材料：**目标规范**（WORKFLOW_SPEC，只对已确认目标生效）、**当前实现说明**（`docs/CURRENT_STATE.md`，"目前 Files 在右侧"是事实不是约束）、**迁移说明**（任务 PRD/implement 中的去向记录）、**历史参考**（归档任务、旧原型说明、journal，不参与当前规则裁决，也不进入新任务默认必读包）。
- 工程规范不因产品方向切换而放松：凭据与 Host Key、许可证、数据迁移与回滚、资源清理、测试门禁、主题与 lazy-loading 规则继续在各自 spec 与本文后续条目中生效。
- UI/工作区任务开工前，`trellis-before-dev` 经 `.trellis/spec/frontend/index.md` 的 Pre-Development Checklist 读取 WORKFLOW_SPEC；纯后端或依赖升级任务不必加载。任务 PRD 必须写明一句用户流程、验收编号和引用的 WS 规则；实现与检查使用同一版规范，检查阶段不得依据旧位置断言把已批准的新入口改回旧布局。

## 通用规则

- 所有回答使用中文。
- **动手前先对齐**：遇到需求不明确、有多种合理实现方案、或涉及 UI 布局/交互入口/数据模型归属的决策时，必须先和用户对齐（列选项、给推荐、说明取舍），不要一上来就开干。只有需求明确、实现唯一的情况才直接做。涉及写代码的实现类任务，按下方 Trellis 流程登记任务后再动手。
- 后续项目开发使用 trytrellis.app 的 Trellis 管理。
- 进入仓库后先查看 `.trellis/workflow.md`、`.trellis/config.yaml` 和当前任务上下文。
- 使用 `trellis` CLI，不使用 `trellis-ctl`。
- 开发前优先通过 `python ./.trellis/scripts/task.py list`、`current --source`、`create`、`start` 管理任务。
- 实现前使用 `.agents/skills/trellis-before-dev` 读取 `.trellis/spec/` 规范。
- `.trellis/`、`.codex/`、`.agents/` 是 Trellis 项目文件，应随项目维护；不要提交 `.trellis/.runtime/`、`.trellis/.developer`、Python 缓存或敏感配置。
- 不要提交 `.superpowers/`、`.learnings/` 或敏感配置文件。
- 调研其他项目时，内部可以参考产品思路、交互流程和实现结构，但提交到仓库的文档、注释和用户可见文案中不要明显写“借鉴/参考某某项目”这类表述；确实需要保留调研记录时，使用中性描述并避免给人直接复制外部产品的观感。
- 复用外部代码前必须注意开源协议：MIT、Apache-2.0、BSD 等宽松协议代码可以在遵守原协议、保留必要许可信息的前提下复用；GPL、AGPL、LGPL 等强 copyleft 或协议不清晰的项目不要直接复制代码，只能吸收思路、交互和架构经验后自行实现。
- 分支约定固定如下：日常开发主线使用 `origin/master`，本地开发默认在 `master` 分支并保持对齐 `origin/master`；GitHub 发布主线使用 `github/main`。
- 发版或同步 GitHub 前，必须先确认 Gitee 的 `origin/master` 已完整同步到本地，再将同一批提交同步到 `github/main`；不要跳过这一步直接从本地未知状态推送 GitHub。
- 不要随意创建临时、个人或实验分支，把分支体系搞乱；若需同步其他远端或历史分支，先和用户确认目标分支。
- 前端 UI 开发必须保持风格统一和组件复用；优先基于现有 Radix + Lucide + 项目共享组件封装实现，不要在各个 feature 里零散手写一套弹窗、按钮、确认框或表单样式。
- 前端视觉实现必须严格使用全局 token 体系：颜色、背景、边框、状态、阴影、材质优先使用 `src/styles/tokens.css` 中的 `--mx-*` token，并通过 `src/styles/app.css` 的共享样式落地；除非确有业务语义且先说明原因，不要在业务组件里随意写硬编码颜色、孤立渐变、一次性阴影或脱离主题的状态色。
- 当前默认开发观感以亮色主题为基线，但新增或修改任何 UI 组件、状态、hover、表单、按钮、列表、面板时，都必须同时考虑显式暗色主题和 system-dark；不要交付只在亮色下成立的浅色 surface 或状态色。
- 软件整体视觉 token 方向是 Apple 风格磨砂玻璃桌面体验：材质、模糊、透明度、chrome/sidebar/panel 层级必须走全局 `--mx-material-*`、`--mx-chrome-*`、`--mx-sidebar-*`、`--mx-panel` 等 token；不要在 feature 内自造一套玻璃、亚克力、阴影或半透明配色。
- 侧边工具面板（当前位于右侧，目标位置按 `docs/WORKFLOW_SPEC.md` WS-E04 / WS-E06 调整，本条只约束风格不约束位置）、设置面板、配置编辑面板等同类桌面工作区面板必须沿用现有 mXterm 面板风格：紧凑信息密度、8px 内圆角以内、细边框、token 背景、统一按钮/图标/表单布局；操作区、刷新区、底部动作栏等位置要参考已有面板模式，不要为单个 feature 自己另画一套卡片、按钮、阴影、间距或面板结构。
- 下拉/菜单必须使用项目共享下拉和全局浮层样式：优先使用 `src/shared/ui/AppSelect.tsx`、Radix 菜单能力以及 `select-menu-content` / `select-menu-item` 等共享类；不要直接使用原生 `<select>` 做业务下拉，也不要在 feature 内手写一套下拉浮层样式。
- 同类 UI 组件或交互在项目中出现两次及以上时，必须抽到 `src/shared/ui/` 或全局共享样式中复用；不要复制粘贴两份 feature 私有组件/样式。复用前先搜索现有实现，缺少通用能力时先补共享组件，再接入业务。
- 涉及 UI 结构、视觉风格、颜色、布局、交互状态、弹窗/菜单/表单等设计改动时，必须先使用 `ui-ux-pro-max` 做设计/审查，并把结论落实到现有 mXterm 风格与全局 token 上；不要引入与当前桌面工具风格不一致的独立视觉体系。
- 新增 UI 交互前先检查 `src/shared/ui/` 和 `.trellis/spec/frontend/`；缺少通用能力时先补共享组件/规范，再在业务组件中使用。
- 首页/主窗口启动性能是长期约束：`main.tsx` 和 `App.tsx` 必须保持轻量，先恢复启动主题与记忆窗口状态，再显示轻量 App 壳；不要在入口或 `WorkspaceShell` 顶层静态引入非首屏重模块。`TerminalPanel`/xterm、设置页、Docker、远程文件、VNC/noVNC、监控、隧道、命令库、连接弹窗、快速搜索、Monaco/编辑器和大型静态数据必须通过 `React.lazy`、动态 import 或 idle 预热按需加载。涉及启动路径、首页、工作区首屏、设置/终端配色/工具面板等改动后，必须运行 `node scripts/check-startup-module-boundary-source.mjs`，并确认 `npm run build` 产物没有把重模块合回首屏 chunk。
- 后续做前端功能原型或交互探索时，默认基于 `prototype/light-neutral/mxterm-light-neutral.html` 继续迭代；先在该 HTML 中实现可点击的伪功能、假数据状态、弹窗/菜单/筛选/搜索等交互动线，确认体验后再迁移到真实 React/Radix 项目实现。除非用户明确要求直接改项目，不要另起一份无关原型或跳过该原型母版。该母版承载的是视觉、token 与组件基线，**不是信息架构约束**：配套说明 `mxterm-light-neutral-design.md` 中「顶部只放 SSH 连接、左侧固定连接仓库、文件在右侧」等条目已按 `docs/WORKFLOW_SPEC.md` §11 替代（该文件顶部有逐条适用范围表）；新工作流原型在同一 HTML 上改信息架构，不能以"沿用母版"为由保留旧布局。
- 修 bug 时不要用“虚假兜底”掩盖根因：例如用列表去重隐藏重复数据、静默截断/改写用户输入、只在 UI 层隐藏异常状态。必须先定位导致错误写入、重复事件、错误状态流转或错误命令调用的根因，从数据/命令/事件源头修复；确实需要兼容历史脏数据时，要明确标注为迁移/清理逻辑并说明原因。
- 终端、PTY、SSH shell integration、启动输出、banner/prompt、输入延迟等问题尤其不能用“隐藏输出/过滤显示/压缩脚本/吞掉进度日志/延后渲染”等方式制造看似正常的效果；必须先证明根因来自哪一层（后端通道、PTY 模式、shell 注入、前端缓冲、xterm 写入或事件重复），再从源头修复。只有在保留真实语义且明确记录原因时，才允许做兼容性过滤或迁移清理。
- 不自动提交或推送 git；所有更改先暂存并等待人工审核。
- 提交前必须检查 `git status --short` 和 staged diff，并确认没有敏感信息。
- Git 提交信息一律使用**英文**（遵循常规英文提交规范：首行祈使句简明摘要，正文按需补充要点）。此项**显式覆盖**全局 CLAUDE.md 中「Commit messages must be Chinese / 提交信息使用中文」的规则，在本项目以此为准。注意：仅提交信息改用英文；代码注释、文档与用户可见文案仍按本项目惯例使用中文。
