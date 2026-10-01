# WF-03 SSH 与 Files 日常操作

> 基线：stacked on WF-02B PR #24 head `34c40e8`, CI #168 success. A04 GUI acceptance remains deferred.
> 验收：**A05 / A06**。规则：WS-F01～WS-F09。

## Goal

把已有 SFTP/RemoteFilePanel 能力从右侧混合工具容器迁入左侧日常 Files 路径，并以活动 SSH terminal/pane 为唯一上下文。已有保存 SSH 与 Quick Connect temporary SSH 必须一致。

## Delivery slices

1. **03A 左侧真实 Files**：抽出 files-only 可复用视图，挂入 Sessions | Files；右侧只保留 monitor/commands/tools/tunnels/AI；复用活动 pane selector 和 tab stateKey。
2. **03B 目录跟随与过期响应隔离**：跟随状态按逻辑实例保存；OSC7/简单 cd 更新只作用当前 pane；A 的慢请求不可覆盖 B。
3. **03C 编辑/传输生命周期**：保持 Monaco mtime/size 冲突提示、未保存关闭确认、上传下载队列/retry；补断线/重连和关闭中的传输策略。

## Acceptance

- [ ] A05：同一主机两个 pane 进入不同目录，焦点切换后 Files 对应正确 pane/path。
- [ ] A05：A 的延迟目录响应不能覆盖已经切到 B 的视图。
- [ ] 已保存 SSH 与 temporary SSH 使用同一左侧 Files 能力。
- [ ] Home/Local/RDP/VNC/空 split pane 不残留上一 SSH 的可操作文件列表。
- [ ] A06：编辑期间远端发生变化，保存时给出冲突处理。
- [ ] 关闭未保存编辑有明确确认；上传下载/重试不因布局迁移丢失。
- [ ] 自动化、CI 与最终真实 Tauri A05/A06 验收通过。

## Deferred decisions

WS-F03（默认跟随开关、手动浏览后是否自动暂停）和 WS-F09（活动传输时关闭实例的最终策略）保持待确认；在对应切片用可逆策略实现，不提前固化产品结论。
