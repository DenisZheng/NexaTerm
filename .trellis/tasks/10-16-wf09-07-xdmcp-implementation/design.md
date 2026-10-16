# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§4、§7–9。阶段：X0–X3。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。

## X1 selected implementation slice
Concrete contracts are in .trellis/spec/backend/xdmcp-runner.md. A worker-owned lease survives async caller timeout/drop and retains quota through real OS spawn/process/auth-directory cleanup. Main-only IPC supports an explicitly selected native external engine for development; no packaged engine, automatic PATH discovery or desktop-ready claim. Windows suspended creation plus JobObject prevents a child from escaping before assignment; Unix waitid/WNOWAIT pins the group leader until signals are sent. Existing locked libc is reused directly on Unix; Windows feature selection adds job/security APIs without a new crate version. Actual native fixture tests are not X server interoperability.
