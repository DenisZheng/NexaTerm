# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§4、§7–9。阶段：X0–X3。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。

## X1 selected implementation slice
Concrete contracts are in .trellis/spec/backend/xdmcp-runner.md. A worker-owned lease survives async caller timeout/drop and retains quota through real OS spawn/process/auth-directory cleanup. Main-only IPC supports an explicitly selected native external engine for development; no packaged engine, automatic PATH discovery or desktop-ready claim. Windows suspended creation plus JobObject prevents a child from escaping before assignment; Unix waitid/WNOWAIT pins the group leader until signals are sent. Existing locked libc is reused directly on Unix; Windows feature selection adds job/security APIs without a new crate version. Actual native fixture tests are not X server interoperability.

## X0 fixed source collection slice（2026-10-19）

先完成源码核验入口，具体契约见 `.trellis/spec/backend/xserver-source-review.md`。固定官方21.1.25归档、分离签名及公钥；先校验字节/hash，再以隔离gpgv验证签名，最后只读核对完整tar文件清单和构建/许可锚点。旧DSA-1024/SHA-1明确保留审查项。采集完成只输出REVIEW-REQUIRED，不批准发行、不复制外部实现、不执行上游构建脚本。上游已有MinGW目标，但实际编译、依赖许可闭包、PE导入表与资源仍留待后续；不先指定未验证的构建profile。

## X0 Windows native build slice（2026-10-19续作）

沿固定源码继续原生Windows开发构建；具体契约见`.trellis/spec/backend/xserver-windows-build.md`。上游Autotools已有完整MinGW配置及随归档生成的parser；先用UCRT64目标构建2D/XDMCP，显式关闭GLX/DRI/非目标服务器及非必要服务。XCB、X11、字体/键盘依赖由官方固定源码构建至私有prefix，构建工具与实际PE运行库分开记录。优先使用上游代码，不复制聚合候选；任何必要修正单独留差异。真实Windows构建/版本probe、PE导入闭包与许可锚点提供开发证据，未完成的逐文件/生成器例外/运行库及资源义务继续标明，不能据此采用发行组件。

## X0 Windows XKB runtime slice（2026-10-20续作）

在#85已验证的私有原生prefix补固定官方xkbcomp 1.5.0及xkeyboard-config 2.48，不重做引擎核心。继续复用下载、隔离签名、源码适配、安装owner、C输入与PE递归门禁。2.48的8个源码符号别名只按精确名称/相对目标/目标字节pin转换为普通文件，其他链接仍拒绝；版本化数据目录直接接到引擎与工具，不创建全局/系统别名。数据生成器和目标运行文件分开留证，保留原始notice。

实际目标libxkbfile解析私有base/evdev规则，原生xkbcomp清空默认搜索路径后编译US/DE键盘至XKM，再反编译验证Y/Z位置；空数据根及不存在规则必须按明确非零码拒绝。完整安装数据逐文件绑定固定源码或实际生成输出及owner，规则/兼容symbols独立重生成的LF规范化hash另留证，不替代原始字节hash。XWin与xkbcomp的实际PE闭包均检查；现有静态成员门禁仍只覆盖XWin，不扩张为工具及DLL内部许可批准。distributionApproved/bundled/desktopVerified继续false；无桌面或安装包声明。

## Application exit completion barrier（2026-10-18续作）

用户stop的2秒响应预算与应用退出完成分开。`shutdown_wait`在同一registry临界区关闭admission、取消全部条目、移除未使用租约并订阅最多4个真实worker完成watch，随后锁外逐个等待。完成信号仍由worker在process和RunDirectory实际清理后发布，不添加成功超时或轮询空表推断。Tauri Exit与其它资源owner并行await，并只记录固定失败code。阻塞OS操作/目录删除时退出继续等待；这不解决Unix宿主SIGKILL，也不改变尚未采用的发行引擎或桌面能力。

## X0 Windows private PE linkage slice（2026-10-20续作）

#86的代码9a815d5已过完整CI699、source32与原生29；四组键盘往返、两个负向及SDK顺序探针已取得真实Windows结果。继续同一任务，按两个实际PE闭包采集除XWin独立既有报告之外的私有DLL与xkbcomp链接细节，契约见`.trellis/spec/backend/xserver-windows-private-links.md`。构建依赖起即保存map；每个目标先绑定自身构建输出与安装PE，再解析其实际LOAD、archive选择和精确生成命名空间。预编译四DLL内部、资源、逐文件权限及发行/桌面仍开放。
