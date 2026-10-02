# WF-04B 实施切片

## 04B-0 启动
- [x] 从 main @ df436408 建 `feat/wf04b-batch-open-split`。
- [x] 读取 9-23 mainline、Delivery Plan、WORKFLOW_SPEC、ROADMAP 与现有 split / ConnectionPane / open path。
- [x] 维护者授权“连接全部”性能保护 UX；WORKFLOW_SPEC 升 v0.5，WS-X09 已确认。

## 04B-1 Batch plan / lifecycle
- [ ] canonical group 递归目标与 path。
- [ ] 已打开默认跳过、最多 20 选择。
- [ ] 最多 4 active，waiting-user 占槽。
- [ ] partial failure 不回滚成功。
- [ ] cancel remaining 与 failed retry 纯模型测试。

## 04B-2 Tree preview / orchestration
- [ ] 自定义组“连接全部…”入口。
- [ ] 预览：递归开关、选择、协议/path/auth/open 状态、20 限制。
- [ ] 批次进度与结果；不阻塞用户去处理 credential/host-key。
- [ ] 复用现有 open/cancel，不误关 pre-existing instances。

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
