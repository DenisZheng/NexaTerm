# Execution plan

状态：2026-10-16 已获开工授权；本轮先交付 X1 运行核心与精确能力/IPC，X0 组件清单未批准前不引入外部发行二进制。

- [ ] X0：核对候选精确版本/许可/依赖，建立可复现构建与分发 manifest；候选不等于采用。
- [ ] X1：实现受管 runner、独立 display、状态与取消/关闭所有权，建立 socket/进程 fixture。
- [ ] X2：Windows 随包组件、安装/签名和 direct-query 真实桌面；补会话配置、原型与能力入口。
- [ ] X3：macOS/Linux 引擎与打包适配；逐平台留证，不用外置模式替代 bundled 完成。
- [ ] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [ ] 运行受影响测试、类型/构建及既有 source/security/license gates，三平台 CI；不以静态检查代替 socket/进程运行。
- [ ] 维护 Draft PR 和平台证据，真实验收统一后续；未通过项逐一标明。

## X1 implementation evidence (CI pending)
Owner/lease, fixed native arguments/private authority file, platform process group/job cleanup, main-only IPC and window/exit hooks implemented. Eight native fixture/contract tests added, executed by three-platform CI; local Rust unavailable. Local line/capability/CSP/diff gates PASS. X0 component source baseline is recorded separately; no engine binary adopted, no bundled capability or real desktop claim. UI/connection schema and X2/X3 remain outstanding.

First CI607: frontend/security/license PASS; all three Rust cargo-check jobs found AppError code argument needs &str rather than String. Corrected without changing the error contract. Added an actual async-start abort regression with a test-only worker gate; it asserts cancellation before explicit stop and quota retention until the worker really returns. Final three-platform result pending.

Known X2 boundary: Unix hard-crash recovery needs a supervisor/parent-death strategy and real-engine socket/log cleanup verification; current process-group ownership covers explicit stop/window destruction/normal exit, not a claim that SIGKILL of the host cannot leave an engine. Windows job handles provide kill-on-host-close.

CI608 / code64d5da1: Linux and Windows all eight new tests PASS; frontend/security/license/fixtures PASS. macOS has three actual lifecycle failures (normal-exit observation and explicit/shutdown cleanup), not a compile issue. Keep assertions/deadlines unchanged. Add a lightweight harness importing the exact production platform module for fast native diagnostics without compiling the GUI graph; its dependency lock must remain a subset of the application lock. Final fix/CI pending.

Fast native run1 reproduced macOS explicit-stop error EPERM (errno1), with Linux/Windows PASS. Corrected Darwin zombie-only group classification through bounded native process metadata, failing closed for live/unknown/inaccessible groups. Added live-group rejection assertions; original cleanup/timeout assertions and budgets unchanged. Final native and full CI pending.
