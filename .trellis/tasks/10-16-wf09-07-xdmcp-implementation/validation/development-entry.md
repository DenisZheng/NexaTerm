# XDMCP 开发会话接入验收

日期：2026-10-31。沿同一任务、分支 `build/wf09-07-resource-audit` 和 Draft PR #89。范围是实际开发入口与受管运行时接线，不是 X01 随包或真实桌面完成。

## 已实现

- 统一新建菜单的「XDMCP（开发）」创建独立临时实例。面板可填写目标/本机 IPv4、选择原生外置程序，确认两项单次许可后调用 typed reserve/start/status/stop。
- `XdmcpSessionOwner` 私有持有 reservation 与本次冻结参数；轮询固定状态，取消先 stop，不等待 start/status 才发送。晚 reserve 精确回收；清理失败保留实例并允许重试关闭。
- querying 只显示「引擎已启动；桌面登录未验证」。不自动下载/选取引擎、不改防火墙、不收集用户名/密码、不提供假聚焦/假登录成功。
- 通用 PTY 关闭、分屏、克隆、恢复重连、批量状态、MultiExec、AI 与历史排除 XDMCP；实例及其 order/active 引用不写入工作区快照。
- 同一 light-neutral 原型母版补齐许可、查询、取消、清理失败与重试动线；实际 React 表单复用全局紧凑样式、Lucide、双语与主题 token。

## 本地自动化

- 新增 42 项 Vitest 用例：wire/IPC、owner 迟到与清理竞态、registry、表单/文件选择器/许可/错误焦点、输入和隐私边界。
- `scripts/rlogin-entry-routing.test.mjs` 共 15 项通过，含本次新增 3 项真实 shell 函数执行：精确关闭屏障、非 PTY/AI/历史隔离和空实例创建。
- 完整前端 146 文件、1202 项通过、1 项原有 todo。命令在当前进程临时使用 `NODE_OPTIONS=--no-experimental-global-navigator`，使 node 环境没有浏览器语言来源并走已有英文默认；jsdom 的 DOM 语言测试仍照常运行。未修改产品语言逻辑或弱化断言。
- 默认中文 Windows 环境有 7 项原有英文文案断言失败（connectionDialogSubmit、tunnelRuleConnectionState、a14RestartAcceptance、shellHydration）；设置 LANG/LC_ALL 不改变本机 Node navigator 的 zh-CN。该环境差异单独保留，不写成原命令无条件全绿。
- Windows 脚本全集 186 通过、10 项 POSIX Save As fixture 环境失败、3 项安全集成环境跳过。失败涉及缺 `/bin/sh` 与无 symlink 权限；同一 `wf09-editor-save-as.test.mjs` 在现有 WSL Ubuntu 24.04 下 11 项全部通过，没有改系统安全策略或修改无关测试。
- 类型检查、生产 build、startup lazy boundary、行数门禁、i18n、快照、批量/分屏、MultiExec、RDP/VNC 入口、恢复、中键关闭及 Tauri capability/CSP 检查通过。生产 pane/runtime 仍单独分块，不进入首屏静态链。

## 实际浏览器检查

浏览器插件初始化因其内部引用的旧版本 `browser-service.mjs` 缺失而不可用；改用本机已缓存的 Playwright 与已安装 Edge，headless 独立临时上下文，不访问用户浏览器 profile、不增加项目依赖。实际浏览器版本 `156.0.4314.50`。

- 实际完整工作区的新建菜单可以进入面板；空白实例没有自动启动；无原生 IPC 的浏览器预览在明确提交后显示失败，而非伪造查询/成功，仍能关闭回首页。
- 校验汇总获得焦点，字段保留稳定可访问名称；地址编辑撤销两项许可，提交消耗许可。实际检查发现内联错误会污染字段名，已用 `aria-labelledby` 固定名称并补回归。
- 1440×1000 的浅色、显式深色、system-dark 检查；900×700 的面板可纵向滚动，内容宽度/滚动宽度均 404px，无面板横向溢出。system-dark 同时启用 reduced motion。截图等待实际主题背景完成切换，不把过渡帧当最终状态。
- 页面异常 0；同母版原型完成查询 → 取消 → 模拟清理失败 → 重试 → 清理完成 → 关闭。
- 本机记录在忽略目录：`.trellis/.runtime/xdmcp-ui-check.json`、`xdmcp-{light,dark,system-dark,narrow,web-unavailable}.png`、`xdmcp-prototype-cleanup.png`。这些不作为分发资源提交。

`ui-ux-pro-max` 初次只检查了安装入口，后续在本机既存 `.trellis/.runtime/ui-ux-pro-max-skill` 缓存找到并实际执行审查。`error summary validation --domain ux` 命中聚焦汇总、可播报错误与内联错误；`async form feedback --stack react` 中采用异步失败反馈建议，不为已有 store 强换 React Actions。不创建新视觉体系；错误汇总链接沿用全局错误色，避免浏览器默认颜色偏离主题。

## 仍未执行

- 原生 Tauri WebView 中的选文件/真实 X Server/授权 Linux XDMCP 桌面联调：NOT-RUN。浏览器调用失败、模拟 owner 与原生进程 fixture 均不替代此项。
- 所需输入仍是一个来源已核验且不受当前隔离事件影响的开发引擎、已授权并启用 XDMCP 的 Linux 靶机，以及可回连本机选定 TCP 端口的测试网络。未扫描网络或自动配置远端服务。
- `x2-windows-desktop-preparation.md` 的 W01–W14 仍按现场证据逐项执行，不能整表标记 PASS。尚无登录、分辨率/键盘、掉线/重连、真实桌面关闭和残留进程验收结论。
- 正式随包、许可/资源采用、打包与签名仍未完成；`bundled / desktop_verified / distributionApproved` 不变。本机未恢复杀软文件、未重跑完整 X Server 构建。

## 远端门禁

本文提交时新增接入尚待本批提交对应的 PR CI；旧 HEAD `e008127` 的成功结果不能挪用。精确新 SHA、run 与阶段结论在 PR #89 的开发接入阶段块记录；只在新门禁完成后向维护者报告本阶段完成。整个 XDMCP 任务保持 in_progress，不合并、不发版、不归档。
