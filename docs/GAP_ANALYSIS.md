# 需求差距分析

## 判定规则

- **P0**：影响安全、数据完整性、测试门禁、核心 v1 验收或架构演进，必须在功能扩展前处理。
- **P1**：影响重要能力或跨平台交付，但可在 P0 基线后分批完成。
- **P2**：明确列为后续增强或非 v1 主线。
- “缺失”与“环境阻塞”分开；检查脚本漂移不等同于产品功能缺失。

## P0 差距

| ID | 差距 | 证据 | 风险/影响 | 依赖与验证 |
| --- | --- | --- | --- | --- |
| H0.1 | 依赖和安全基线未闭合 | npm audit：0 critical/5 high/16 moderate/5 low；cargo 工具不可用；tauri CSP 为 null；MCP 默认监听 `0.0.0.0:8765`；AppError 含 raw_message | XSS/供应链、远程暴露、错误泄露、发布不可审计 | 先恢复工具链和 registry；cargo audit/deny、pnpm audit、secret/log/IPC review；逐项修复或书面接受风险 |
| H0.2 | 前端测试基线薄弱 | package `test` 为 no-op；无 Vitest/jsdom；Node 脚本 4/7 可运行、3 个因 TypeScript 阻塞 | 状态/连接/恢复回归无法在 CI 早发现 | 先安装锁定依赖；建立 reducer/state/component 测试和 CI gate |
| H0.3 | WorkspaceShell 过深过宽 | 14,381 行、108 useState、464 本地函数，持有多个领域状态 | 任何功能改动扩大回归面；无法局部测试/回滚 | characterization tests→WorkspaceState→SessionTabs/Split/Tool controllers；每步保持 lazy boundary |
| H0.4 | i18n 未形成契约 | 无 i18n 依赖/catalog，大量硬编码中文 | v1 English/zh-CN 验收不可靠，文案散落 | 先建立 shared translation contract、locale fallback 和日期/错误格式测试，再迁移 feature |
| H0.5 | Workspace Restore 不完整 | 只有 `windowState.ts` 窗口几何；SQLite 无 workspace/session layout 表 | 重启无法恢复工作区；恢复失败可能损坏其它 session | 先定义 snapshot schema/version/迁移和局部失败，再做 UI 入口与三平台验证 |
| H0.6 | 许可证清单和 bundled inventory 缺失 | 顶层 LICENSE 只有 MIT；无 THIRD_PARTY_LICENSES；Cargo.lock 无 license metadata；sidecar/runner/assets 未完整盘点 | 发布时遗漏 MPL/二进制条款，无法证明合规 | cargo deny/license、npm lock/asset/binary inventory、自动生成并人工复核 notices |
| H0.7 | 三平台和发布证据缺失 | 当前无 cargo/rustc；未完成 Win/macOS/Linux build/run、签名、公证 | v1 acceptance 无法宣称 | 按平台矩阵准备 runner/证书/硬件，记录可重复日志和 artifacts |

## P1 差距

| ID | 差距 | 当前判定 | 后续方向 |
| --- | --- | --- | --- |
| G1.1 | X11 缺失 | 未发现完整 module/command/runner | 先确定 X11/XWayland 范围与外部 runner 许可证，再实现 capability-gated feature |
| G1.2 | RDP 仅部分平台路径 | Windows native/embedded，非 Windows external/stub；IronRDP check 被工具链阻塞 | 建立 runner adapter、平台 capability 和退出/重连测试，不承诺自研协议栈 |
| G1.3 | VNC runner 运行时证据不足 | noVNC/websocket relay 静态存在 | 验证 Windows/macOS/Linux server、窗口关闭、异常退出和资源回收 |
| G1.4 | Sync Input/Command Sender 契约漂移 | source checks 报历史字段和激活 tab 同步缺口 | 先固化 state/action/payload 约束，再接 MultiExec，避免 UI 去重或隐藏状态 |
| G1.5 | Proxy/Jump 互操作尚未证明 | HTTP CONNECT/SOCKS5、单跳 jump 已实现 | 矩阵覆盖认证、DNS、超时、host key 和 nested jump 明确拒绝 |
| G1.6 | PTY/runner 隔离和泄露证据不足 | manager 有 spawn/cleanup；无长时/异常退出报告 | 做生命周期集成测试、句柄/线程/子进程观测和恢复场景 |
| G1.7 | 产品品牌与包元数据不一致 | package/tauri 仍有 m-xterm/MXterm；需求目标为 NexaTerm | 先定义兼容策略，再改显示名、标识和升级路径，避免破坏存储/更新 |
| G1.8 | 存储 schema 演进边界不完整 | migration 只覆盖现有表；workspace 模型未定义 | 由 H0.5 产出版本化 schema、backup/rollback 和旧版本兼容矩阵 |

## P2 差距

- FTP/FTPS：需求明确为 P2，不应抢占核心 v1 安全和恢复工作。
- 更广的 MobaXterm 克隆范围、移动端、Web、企业云等均为非目标。
- 高级多跳、更多外部协议仅在 capability 和许可证边界明确后再排期。

## 检查脚本差距的分类

以下失败不能直接等同于产品缺失：

- 依赖恢复后 source checks 已能执行 TypeScript 路径；当前剩余失败集中在契约/样式基线、检查脚本输出路径假设和缺少 Rust 工具链。
- Jump source check 与当前单跳 `terminal/session.rs` 实现不一致，应修检查契约或标注历史预期。
- Command Sender、AppSelect、dark-mode、scrollbar、iTerm2 scheme、终端目录/启动输出等失败需要恢复依赖后逐项复现；复现前不得通过过滤、去重、吞异常来“修绿”。

## 优先顺序

```
工具链/证据恢复
   ├─ H0.1 安全依赖 ─┬─ H0.6 许可证
   ├─ H0.2 前端测试 ─┴─ H0.3 WorkspaceShell seam
   └─ H0.7 平台矩阵
H0.3 ──> H0.5 Workspace Restore ──> G1.4 MultiExec/Sync
H0.1/H0.7 ──> G1.1 X11 + G1.2 RDP + G1.3 VNC
H0.4 i18n 与品牌/发布并行，但需共享组件和平台门禁
```
