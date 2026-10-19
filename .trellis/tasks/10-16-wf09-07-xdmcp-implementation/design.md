# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§4、§7–9。阶段：X0–X3。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。

## X1 selected implementation slice
Concrete contracts are in .trellis/spec/backend/xdmcp-runner.md. A worker-owned lease survives async caller timeout/drop and retains quota through real OS spawn/process/auth-directory cleanup. Main-only IPC supports an explicitly selected native external engine for development; no packaged engine, automatic PATH discovery or desktop-ready claim. Windows suspended creation plus JobObject prevents a child from escaping before assignment; Unix waitid/WNOWAIT pins the group leader until signals are sent. Existing locked libc is reused directly on Unix; Windows feature selection adds job/security APIs without a new crate version. Actual native fixture tests are not X server interoperability.

## X0 fixed source collection slice（2026-10-19）

先完成源码核验入口，具体契约见 `.trellis/spec/backend/xserver-source-review.md`。固定官方21.1.25归档、分离签名及公钥；先校验字节/hash，再以隔离gpgv验证签名，最后只读核对完整tar文件清单和构建/许可锚点。旧DSA-1024/SHA-1明确保留审查项。采集完成只输出REVIEW-REQUIRED，不批准发行、不复制外部实现、不执行上游构建脚本。上游已有MinGW目标，但实际编译、依赖许可闭包、PE导入表与资源仍留待后续；不先指定未验证的构建profile。

## Application exit completion barrier（2026-10-18续作）

用户stop的2秒响应预算与应用退出完成分开。`shutdown_wait`在同一registry临界区关闭admission、取消全部条目、移除未使用租约并订阅最多4个真实worker完成watch，随后锁外逐个等待。完成信号仍由worker在process和RunDirectory实际清理后发布，不添加成功超时或轮询空表推断。Tauri Exit与其它资源owner并行await，并只记录固定失败code。阻塞OS操作/目录删除时退出继续等待；这不解决Unix宿主SIGKILL，也不改变尚未采用的发行引擎或桌面能力。
