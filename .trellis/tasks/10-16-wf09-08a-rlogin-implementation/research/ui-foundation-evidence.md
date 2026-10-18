# Rlogin 表单与连接尝试组件执行证据

范围：在原母版串通Rlogin交互，提取既有五协议纯表单转换并加入独立Rlogin分支/字段组件；有界原始/文本输入共用队列；新增workspace生命周期attempt owner。尚未挂载TerminalPanel/Workspace真实Rlogin会话，不开放terminal_available，也不新增可点击Rlogin协议入口。当前是后续实际入口的生产组件，不称为完整终端功能。

## 兼容与行为

- 抽取connectionForm.ts前先固定7项既有行为，之后增加9项Rlogin行为；保留旧协议凭据/配置隔离、重复名称、source_connection_id与元数据重置。dialog和useConnections均走独立Rlogin转换，不回填保存的SSH用户，不默认替换端口0/速率0。
- 既有Radix表单使用独立本地/远端用户和IPv4、terminal/speed及8种编码；不显示SSH凭据。元数据不携带本次许可/UUID。原母版接实际全局tokens并提供亮/暗/system状态，不另建视觉体系。原生WebView焦点/主题统一后续验收。
- 原始二进制每code unit必须0..255，32KiB分块；文本4KiB UTF8分块。二者共用128KiB/256块/256调用、单个issued write及close完成屏障，失败不重放。
- owner固定目标后查询真实能力，单次许可绑定该快照；迟到reserve只close，已issued start立即发close取消并等待两者完成（原生start实际等待ACK，不能等其结束再取消）。同步状态发布后再次检查取消，避免订阅者取消后仍发IO。
- 同一owner有一个25ms timer/poll，缓存不含UUID/输入/输出的状态；无变化不通知。close失败保留controller/UUID供重试，阻止替换；取消重连等待旧清理，EOF不生成认证或exit0。未挂载pane不能丢失owner。
- 已导入Rlogin的通用SSH连接流程明确失败，不询问SSH凭据、不访问通用provider，也不在浏览器预览返回伪成功。执行真实shell函数的script回归保护该边界；后续挂载时在路由前接实际native入口。

## 本地验证

前端123文件1059通过/1既有todo，43项新增行为测试（表单16、字段3、二进制9、owner15），无新增skip/todo；脚本180通过/3既有环境skip，其中执行真实shell路由保护。类型、构建、25项source门禁、line budget及diff检查。原型DOM验证已记录在prototype-rlogin-review.md；不是原生焦点/视觉/服务端证据。

完整CI待本切片Draft PR触发后记录；本地无Rust/完整扫描器，不替代三平台完整CI。真实TerminalPanel、workspace关闭/分屏/恢复/隐私路由仍继续开发；DNS、Windows精确flush、真实rlogind和内置Xserver/Rsh也尚未完成。


## 最终完整CI

执行代码`9a92f487f806519789453b7b4febf1ff1e4e10e0`；[Draft #76](https://github.com/DenisZheng/NexaTerm/pull/76)，基于#75。[完整CI646](https://github.com/DenisZheng/NexaTerm/actions/runs/39089114691)全部7个执行job SUCCESS；条件打包未触发。前端123文件1059通过/1既有todo，43项新增测试无skip/todo；脚本180通过/3既有环境skip，包含真实shell的非SSH入口保护。类型、标准build、source、安全、许可证和fixtures均通过。Rust library Linux560（另4既有ignored）/macOS561/Windows560，binary19、integration1、doc0通过，无新增ignore。

PR75配置存储执行90a95b6已由完整CI645通过；其收口408bf8e只改文档，与该执行代码生产源码/工作流/依赖相同。PR76文档收口同样保持执行源码一致。

下一切片已建立feat/wf09-08a-rlogin-entry本地工作树，私有renderer绑定及TerminalPanel隔离分支开始实施，局部10项测试通过；它们尚未提交此PR，也未启用新建入口或terminal_available。具体接线边界见research/mounted-entry-seams.md。主任务及L1仍in_progress，真实Workspace/关闭/重连/分屏/恢复及隐私路由继续开发，不是只剩人工验收。
