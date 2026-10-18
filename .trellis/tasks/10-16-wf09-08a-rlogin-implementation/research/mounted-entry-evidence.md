# Rlogin 实际工作区入口执行证据

日期：2026-10-18。基于已验证的#76代码与文档头cee7e736，继续同一母版、WS-P01/P02/P04和WS-R01/R02。

## 实际功能与归属

- 实际新建菜单/六协议配置、保存后立即连接、已有配置/new实例/分屏复制/批量连接均在通用SSH前路由原生Rlogin。新保存配置直接使用返回对象，避免React目录尚未发布导致不连接。主窗口启动仅静态加载轻量队列/元数据服务；实际owner及xterm按需动态加载。
- 每逻辑tab私有owner map；目标/config/encoding/window先固定再等模块/清理/许可。16项有界FIFO许可使用既有Radix ConfirmDialog；旧token不能批准或取消下一项。能力检查先于许可；Unix terminal_available=exact_flush，Windows和浏览器仍明确不可用。许可不保存，不自动提权，不降级为高源端口。
- pending import取消/关闭后迟到模块不能创建连接；已发start立即取消，再等待真实start/close。关闭成功后才forget/删标签，失败保留owner/tab并允许重试同一资源。混合关闭及split计划等待native完成，失败保留可见布局。pane卸载只detach，工作区退出负责close，Rust生命周期为最终屏障。
- TerminalPanel复用既有xterm/theme/search/fit，私有分支位于公共output queue/events/history/macros之前； credited frame直接解析确认，原始/文本输入复用有界队列，resize只在ACK后可写。末端关闭不伪造exit0/认证成功。异步剪贴板固定对应renderer，迟到数据不发给新generation。失败挂载显示有限固定错误，避免抛出破坏整个工作区。
- 快照只保留logical source/profile/ordinal；Rlogin恢复一律等待显式连接和新许可。Rust递归拒绝reservation_id/allow_plaintext，保留逻辑Rlogin正例。MultiExec/宏、公共terminal_close、历史、AI最近输出/选择明确排除Rlogin；Files只接SSH。原生输出和UUID不进入React持久化投影。

## 本地验证

全量前端131文件1104通过/1既有todo，新增45项行为回归，无新增skip/todo。新增真实shell脚本回归覆盖native close屏障/失败保留、public ID trap拒绝、saved/new/split/restore路由、隐私sink、split失败保留及新保存对象立即连接。既有本地状态面板先做4项回归后抽取为共享状态面板，未提高行数预算。

本地脚本188通过/3既有环境skip；CI清单中全部source gates、独立协议切换source check、line budget、diff和Trellis上下文检查通过。完整构建及三平台CI最终结果待下文记录。原生WebView焦点、显式暗色/system-dark视觉及真实rlogind互通仍按统一验收安排；DOM/组件测试不替代它们。DNS、Windows精确urgent/flush、XDMCP随包Xserver及Rsh仍有开发工作，主任务in_progress。
