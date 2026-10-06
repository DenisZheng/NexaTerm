# 工作区恢复接线契约

## 1. 范围与触发

WF-07 / A14，产品行为按 `docs/WORKFLOW_SPEC.md` WS-R01/WS-R02。涉及加载时序、快照保存、SSH 原位重连和 Files 导航的修改都须检查本契约。

## 2. 签名

- `useWorkspaceSnapshotLifecycle({ enabled, restoreOnLaunch, snapshot, onRestore, runtime })`。
- `WorkspaceSnapshotRuntime`：`load(): Promise<WorkspaceSnapshotEnvelope>`、`save(snapshot): Promise<void>`、`schedule(callback, delayMs): cancel`、`reportError(operation, error)`。
- Tauri 边界维持 `workspace_snapshot_load` / `workspace_snapshot_save({ snapshot })`；runtime adapter 位于 layout 层，workspace hook 仅依赖注入接口和 React。

## 3. 数据与时序

- `enabled` 汇总 vault/连接列表/Local profile 就绪状态，可以暂时撤销；已撤销的读取结果不能回写，后续就绪必须能够重读。
- 只有处理完有效加载结果后才标记本次恢复完成；snapshot 改变、普通 rerender 不应取消一次性加载。
- 500ms debounce 只依据序列化内容变化。按队列串行写入 SQLite，避免较慢的旧保存覆盖新布局；失败必须报告，不得记录为成功保存。
- SSH `request_id` 在每次实际 attempt 生成，使用 `crypto.randomUUID()`；逻辑 tab id 在恢复/重试中保持不变。Host Key 或凭据续接仍走正常连接流程。
- Files `directories` 存储 `activeDirectoryPath`，不是常驻树根 `currentPath`；恢复时从根加载祖先并展开到目标，保持既有树形浏览方式。
- Files `followTerminalDirectories` 是 V1 的可选字段，按逻辑 SSH 实例保存“跟随终端目录”开关，与全局 `followActivePane` 分开。旧快照缺少该字段时沿用默认关闭；仅切换开关也必须通知快照生命周期保存，不能只依赖目录变化。投影与解码只保留现存 SSH 实例，解码只接受布尔值。

## 4. 验证与错误矩阵

| 输入/状态 | 必须行为 |
| --- | --- |
| 读取途中 enabled 变 false | 丢弃旧结果；再次 true 时允许重读 |
| 读取途中普通 snapshot 变化 | 仍处理加载结果一次 |
| 稳定快照且连续终端输出 | 超过 debounce 后仍保存 |
| 保存 A 未结束，B 已到期 | B 等待 A 完成后写入 |
| load/save 失败 | 经 runtime 报告错误；不得标记保存成功 |
| 两个 SSH 同毫秒开始/同 tab 重试 | 输出关联 ID 独立，字节不跨实例 |
| `/srv/app` 已选为 Files 活动目录 | 重启后保留目录，根和祖先仍可见 |
| 同一 SSH 配置的两个实例分别开/关跟随 | 冷启动各自恢复，开关不串实例 |
| 目录不变，只切换跟随开关 | 快照内容更新并进入既有 debounce 保存 |
| 旧 V1 快照缺少实例跟随字段 | 正常恢复，实例跟随默认关闭 |

## 5. Good / Base / Bad

- Good：vault 解锁触发连接列表 reload，过期读取被丢弃，新读取恢复布局；MultiExec 仍由恢复计划强制关闭。
- Base：稳定就绪，读取一次；布局改动 500ms 后保存一次。
- Bad：开始读取即设置永久 started 标记；把新对象引用当作内容变化；用毫秒时间作为并发请求唯一标识。

## 6. 必须测试

- lifecycle hook：就绪波动、普通 rerender、保存排序、unmount、错误上报；实际组合 `useConnections`，不能只测 planner。
- `scripts/wf07-ssh-output.test.mjs`：执行 shell 实际连接函数，验证同毫秒并发和重试的输出隔离。
- `RemoteFilePanel.restore.test.tsx`：实际浏览后重新挂载无缓存实例，检查目录与祖先加载。
- `remoteFileSnapshotBridge.test.ts`：真实投影、JSON 序列化、解码与冷模块恢复的组合回归；同一配置的两个实例必须保留独立目录与 true/false 开关。
- A14 人工坏项使用 `scripts/wf07_a14_fixture.py`，只在应用退出后修改唯一 `A14-` 测试项的快照引用；保留 profile/凭据和原布局，逆向恢复只还原该引用。不要用正常 UI 删除 profile 构造仍打开的占位项，因为该入口会关闭实例。

## 7. 错误与正确

错误：`startedRef = true` 后允许 effect cleanup 作废读取，却不允许再次加载；保存 effect 依赖每次 render 新建的 snapshot 对象。

正确：完成标记属于已处理的恢复结果；读取取消与完成分开；保存 effect 依赖稳定序列化内容，Tauri/计时通过 runtime 注入。

本次缺陷的共同原因是隐含时序假设和接线测试缺口：纯 planner 测试与字符串 source gate 无法验证 React cleanup、并发输出或导航字段语义。
