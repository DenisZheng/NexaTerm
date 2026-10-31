# XDMCP 开发会话

## 1. Scope / Trigger

统一新建入口的临时 XDMCP 实例，引用 WS-M01/M02、WS-E01/E09/E10、WS-P01/P02、WS-N04/N05、WS-R01/R02。本节描述实际开发接入，不批准发行引擎或宣称真实桌面通过。原生生命周期仍以 `../backend/xdmcp-runner.md` 为准。

## 2. Signatures

`shared/tauri/xdmcpCommands.ts` 是唯一前端 IPC 入口：

```ts
xdmcpApi.capabilities(): Promise<XdmcpCapability> // xdmcp_capabilities
xdmcpApi.reserve(): Promise<string>             // xdmcp_reserve
xdmcpApi.start(id, request): Promise<XdmcpStatus> // xdmcp_start {reservationId, request}
xdmcpApi.status(): Promise<XdmcpStatus[]>        // xdmcp_status
xdmcpApi.stop(id): Promise<void>                // xdmcp_stop {reservationId}
```

`XdmcpSessionOwner.connect(request) / cancel() / close()` 返回完成 Promise。`connect` 覆盖本次完整观察周期，不只是启动；`close` 永久关闭 owner。`getSnapshot / subscribe` 提供稳定、冻结且不含私有参数的外部 store。

## 3. Contracts

- request 只传 `executable / target / local_address / allow_external / allow_network`。数值 IPv4 和路径原样传递，不 trim、不支持附加参数；原生格式、绝对路径与文件身份由后端最终验证。
- 两项许可必须单次明确确认；编辑路径/地址时全部撤销，提交时消耗。空白新标签不调用 capability/reserve/start，不自动搜索、执行或下载引擎。
- capability 投影只含三个 boolean 与固定 reason。status 只含 canonical UUIDv4、固定 phase/reason、null 或 100–131 整数 display；列表最多 20 条、无重复或稀疏元素。stop 的成功 wire 返回必须为 `null`。
- 私有 owner 持有 reservation；快照仅 `generation / phase / display / reason`。`querying` 表示引擎已启动，不证明显示管理器响应或用户登录，不提供虚构聚焦/成功按钮。
- `source:xdmcp` 是非 PTY 临时 metadata；不写 `sessionId`。完整实例、order/active 引用从恢复快照排除，拒绝普通 terminal_close、分屏、克隆、批量重连、MultiExec、宏历史及 AI 消费。目标和程序路径只在面板内存与冻结的本次请求中。
- pane 隐藏不结束运行；workspace 私有 registry 管生命周期。关闭先请求 exact stop，再等待晚 reserve/start/status，只有 cleanup 确认后才 forget/remove。StrictMode dispose 只移除开始时捕获的 slot，不清空之后 activate 新建的实例。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 缺许可、IPv4 空白/前导零/未指定/多播/全广播、非法路径语法 | 表单内联错误 + 带字段链接的聚焦汇总，无 IPC |
| 已运行、正在清理或仍持有 id | busy，不启动另一代 |
| capability 不支持 external | unavailable，不 reserve |
| reserve 晚于取消返回 | stop 该 id，不 start |
| start/status 晚于取消返回 | 忽略其状态，不回到 querying |
| status 缺失或 start id 不匹配 | 固定失败 + 清理原 reservation，不清理其他 id |
| stop_pending / stop 失败 | cleanup_failed，保留私有 owner/标签并允许重试关闭 |
| 后端已完成的 closed/failed 终态 | 释放私有 id，保留真实固定原因；不推断登录结果 |
| 文件选择器失败 / raw IPC 诊断 | 固定双语原因，不展示路径/后端原始信息 |

前端没有新增环境开关、持久化 key 或 profile schema。

## 5. Good / Base / Bad Cases

- Good：外置引擎和两项许可明确后启动；切换标签仍运行；取消等待所属资源回收，再次连接重新许可。
- Base：仅打开标签，看到开发模式与网络风险，可以无副作用关闭；浏览器无原生 IPC 时明确失败。
- Bad：清理未完成就移除标签；将 querying 变成“桌面连接成功”；把 handle 放进通用 terminal sessionId；在 app shutdown 前遗弃私有 owner。

## 6. Tests Required

- `xdmcpWire.test.ts / xdmcpCommands.test.ts`：精确 payload、固定错误、畸形列表/状态拒绝与额外私有字段投影。
- `XdmcpSessionOwner.test.ts / xdmcpWorkspaceSessions.test.ts`：晚 capability/reserve/start/status、并发关闭、stop_pending 重试、自然终态、新 generation 和 StrictMode 迟到模块。
- `xdmcpDraft.test.ts / XdmcpSessionPane.test.tsx`：原样输入、单次许可、清理失败仍可操作、错误焦点和 picker 失败。
- `xdmcpPrivacy.test.ts`：持久化、MultiExec、批量状态及动作守卫；`scripts/rlogin-entry-routing.test.mjs` 执行真实 shell 关闭/克隆/分屏/历史/AI 函数，不以静态字符串搜索替代。
- 三主题/窄窗口检查共享 token；build 中 pane/runtime 单独 lazy chunk。真实引擎与授权 Linux 靶机的互通必须独立验收，fixture 不能替代。

## 7. Wrong vs Correct

```ts
// 错误：stop_pending 时丢掉资源归属，并可能把后续原生 id 当作 PTY。
void api.stop(id); removeTab(id);
// 正确：保留 owner 和失败状态；仅成功清理后移除逻辑标签。
await sessions.close(tabId);
sessions.forget(tabId);
removeLocalTerminalTabs([tabId]);
```
