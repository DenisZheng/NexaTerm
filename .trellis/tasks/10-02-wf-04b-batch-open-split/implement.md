# WF-04B 实施切片

## 04B-0 启动
- [x] 从 main @ df436408 建 `feat/wf04b-batch-open-split`。
- [x] 读取 9-23 mainline、Delivery Plan、WORKFLOW_SPEC、ROADMAP 与现有 split / ConnectionPane / open path。
- [x] 维护者授权“连接全部”性能保护 UX；WORKFLOW_SPEC 升 v0.5，WS-X09 已确认。

## 04B-1 Batch plan / lifecycle
- [x] canonical group 递归目标与 path。
- [x] 已打开默认跳过、最多 20 选择。
- [x] 最多 4 active，waiting-user 占槽。
- [x] partial failure 不回滚成功。
- [x] cancel remaining 与 failed retry 纯模型测试。

## 04B-2 Tree preview / orchestration
- [x] 自定义组“连接全部…”入口。
- [x] 预览：递归开关、选择、协议/path/auth/open 状态、20 限制。
- [x] 可取消的 4 并发执行器；waiting-user 保持占槽，active cancel 只触及本批 handle。
- [x] 批次进度与结果；状态面板留在 Sessions 侧栏，credential/host-key 可聚焦到具体实例处理。
- [x] 复用现有 open/cancel；batch handle 绑定新建实例 ID，取消不按 connectionId 关闭旧实例。

## 04B-3 Split
- [ ] 复用现有 2/4 pane 与拖动比例。
- [ ] pane 明确选择已打开实例。
- [ ] pane 显式新建实例。
- [ ] 修正 split anchor/owner 遗留 connection-level 假设，保持 instance binding。
- [ ] 一次操作焦点唯一。

## 04B-4 A08 / delivery
- [ ] 自动化：成功 + 失败 + cancel + retry + pre-existing isolation。
- [ ] 真实 Tauri A08 四维证据。
- [ ] Split 2/4 pane GUI smoke。
- [ ] Draft PR；最终 CI 全绿后等待维护者授权 merge。

每个切片：定向测试 → 相关全量 → source gate → line budget → commit → push → CI。不要修改 line-budget.json；不要启动 WF-04C / WS-X04。


## 04B-1 / 04B-2 自动化证据（2026-10-02）

- CI #214 @ `5ff62e9` 全绿，确认 WS-X09 文档与 04B-1 初始纯模型基线。
- 执行器首轮 CI #216 暴露主动 cancel 与 wait rejection 的竞态：active attempt 会被误记为 failed。
- `771ac08` 修复为先原子记录 cancelled 再调用底层 cancel；CI #217 Frontend / Fixtures / Rust Linux / macOS / Windows / Security / License 全绿。
- 04B-2 在此基线上新增：预览 UI、20 项选择保护、侧栏批次状态、实例级 focus/cancel、RDP/VNC/SSH/Telnet/Serial 运行态映射；等待当前切片 CI。
- `WorkspaceShell.tsx` 保持低于既有 13860 line budget，未修改 `scripts/line-budget.json`。
- A08 真实 Tauri 尚未执行，不以单元/CI 代替。
