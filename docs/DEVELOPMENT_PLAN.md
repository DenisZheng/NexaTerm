# 渐进式开发计划

## 原则

先建立可复现的安全、测试和许可证门禁，再处理 WorkspaceShell 状态深度；协议能力按 capability 和 runner 生命周期交付；每阶段可独立回滚，不做大重写。

## 阶段计划

### Phase 0：基线重现与工具链

目标：固定仓库、锁文件、source checks 和审计输出，补齐 Node/Rust 工具链或记录正式阻塞。

交付：基线报告、Node modules 可复现安装说明、cargo audit/deny 输出、60 个 source checks 分类、平台 runner/二进制清单初稿。

退出门禁：同一 commit 可重跑；环境失败与代码失败分开；无未解释的 Critical/High 安全结果。

### Phase 1：P0 安全、许可证和测试

并行推进 H0.1、H0.2、H0.6、H0.7。先修依赖和暴露面，再建立 Vitest/jsdom、Rust tests、license notices 和三平台 CI/手工矩阵。

退出门禁：npm/cargo 审计有可接受结果；关键状态/连接错误有自动化测试；第三方清单包含 MPL 文件级通知；三平台至少完成 build smoke。

### Phase 2：WorkspaceShell 状态 seam

先为现有行为建立 characterization tests。按顺序抽 WorkspaceState、SessionTabs、SplitWorkspace/Sync、CommandSenderController、FileWorkspace/ToolPanelController。每次只移动一个所有权边界，保持渲染和 lazy import 语义。

退出门禁：无第二套 active/tab/split 事实来源；旧 source checks 和新状态测试都通过；启动 chunk 未变重。

### Phase 3：Workspace Restore 与迁移

定义 workspace snapshot schema、版本号、凭据/host-key 引用、session 恢复状态和失败记录；扩展 SQLite migration，保留 backup/rollback。UI 入口最后接入。

退出门禁：旧数据库可升级、失败可回滚；单个连接恢复失败不阻塞其它项；重启恢复测试覆盖 Windows/macOS/Linux。

### Phase 4：协议与能力矩阵

处理 Command Sender/MultiExec、Proxy/Jump 互操作、RDP/VNC runner adapter 和 X11 范围决策。保留现有 russh/外部 runner 方向，不自研协议栈。每个平台明确 supported/partial/unsupported 及用户可见原因。

退出门禁：真实服务器/runner/hardware 互操作记录；PTY、tunnel、runner 无泄露；错误状态可观测且不崩主窗口。

### Phase 5：i18n、品牌、性能与稳定性

建立 English/zh-CN catalog、fallback、日期/错误/菜单共享文案；处理 mXterm/NexaTerm 元数据兼容。执行 10 SSH + Split + SFTP + Transfer + Monitoring 性能基线、长时 PTY 和恢复压力。

退出门禁：语言切换无硬编码漏出；空闲内存增幅不超过需求阈值（超过 25% 必须复核）；关键场景无可见卡顿和 unhandled Critical/High dependency。

### Phase 6：发布与 v1 验收

完成 Windows/macOS Intel/Apple Silicon/Linux build/run、签名/公证、更新渠道、SBOM/THIRD_PARTY_LICENSES、安装器和外部 runner 归档。按需求 v1 acceptance 全量验收。

退出门禁：三平台 artifacts、许可证/安全报告、关键测试和回滚演练齐全。

## 依赖图

```
P0-00 baseline
 ├─> P0-01 security/deps ──> P0-07 platform release
 ├─> P0-02 license
 ├─> P0-03 frontend tests ──> P0-04 WorkspaceShell seam
 └─> P0-07 platform matrix
P0-04 ──> P0-05 Workspace Restore ──> P1-06 MultiExec/Sync
P0-01/P0-07 ──> P1-07 RDP/VNC/X11
P0-02/P0-07/P0-04 ──> P1-08 i18n/brand
P0-03/P1 tasks ──> P1-09 E2E/perf/stability
```

## 回滚策略

- 状态切分：每个 seam 保留旧路径开关或小提交边界；发现行为差异先回退 seam，不修改数据。
- SQLite：递增 schema version，迁移前备份，失败恢复 journal；禁止静默丢弃快照字段。
- 依赖：锁文件升级单独批次，保留审计 diff；无法修复的漏洞记录受控接受和隔离措施。
- Runner/平台：capability 显式禁用未支持路径，保留真实错误，不伪造成功。
- 品牌/更新：保留旧 identifier、存储目录和升级映射，先做迁移测试再改显示元数据。

## 质量门禁清单

每阶段至少运行适用的 `pnpm run check`、`pnpm run build`、Rust unit/integration tests、source checks、license/security audit；平台阶段追加真实服务/设备和 artifact 归档。所有阻塞项写入报告，不能用“未运行”标作通过。
