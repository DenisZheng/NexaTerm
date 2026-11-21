# Technical design

## 最新排期边界：2026-11-21 暂缓产品化

维护者确认将正式随包、剩余发行材料与跨平台适配后置；保留现有代码、开发外置模式、单次许可、真实状态、所有权/清理和隐私边界，不修改运行时或能力标志，不采用新组件。原始测试材料留本机，不删除、不重复开启窗口。下列设计保留为未来恢复工作的依据，不是当前实施授权；恢复前须重新确认范围、材料身份和平台环境，不能复用失效进程或网络窗口。

## 当前续作：固定上游源码归档完整性（2026-11-21）

延续预编译包/精确配方材料门禁，仅采集 GCC、pixman、zlib 的已声明固定官方归档。先复用原采集器验证四个包、provider、BUILDINFO 与精确 PKGBUILD，再检查源码 checksum 确实位于核验后的配方中；归档 URL/hash 沿用固定声明，补实际压缩字节长度。复用有界流式下载和原子缓存，不执行配方、不解包源码、不运行其中程序。GCC 归档较大，单个输入上限128MiB、下载总预算600秒只作用于该新入口，原包/补丁8MiB与120秒预算不变。

GitHub zlib 下载允许其固定仓库的官方 release-assets CDN 重定向，仍以归档完整hash验证字节，不记录临时签名URL。新JSON分别记录三份归档字节核验与尚缺的winpthreads精确VCS导出；采集成功不表示签名、DLL内部、逐文件许可、源码供给或发行义务已完成。CLI失败移除旧成功并保留本次已完成子项，CI仅保留JSON。产品能力和X2/X3不变。

## 当前续作：专用XDM重传幂等修复（2026-11-01，已授权）

使用与已安装靶机相同的固定源码/发行版补丁，先通过Ubuntu签名的源索引核对下载材料，再在新私有构建目录产生修正版。依赖安装先模拟、锁定版本并检查不移除或意外升级既有包；不使用完整系统升级。修复保持已接受proto-display的授权稳定，仅新会话生成新认证，不修改客户端超时或访问控制以掩盖问题。

已落实为同方案精确匹配时保留已有授权，原方案选择/认证检查不变；只构建daemon，继续使用系统同版本greeter，避免其开发依赖闭包升级既有桌面库。已完成真实原版/修正版对照和专用drop-in切换/回滚，服务最终停止；详见 [私有靶机修复](validation/private-xdm-request-fix.md)。

修复前已有真实协议红色结果；补重复Request、不同display/来源及新会话独立性、原始Manage认证匹配的有界测试。先在独立网络命名空间运行原版/修正版对照，不复用活跃桌面或放行新Windows端口。无登录的协议结果不能代替W07。仅当旧服务/登录会话已收尾后，通过独占drop-in将专用unit指向私有二进制；保留原unit与配置hash，提供验证身份后撤销drop-in的回滚。不覆盖系统二进制，不自动开启下一轮桌面窗口。

## 当前续作：三实例隔离测试（2026-11-01，已授权）

在新的忽略目录保留专属恢复状态，不改旧窗口脚本或收据。复用原规则快照与逐过滤器校验、先持久化后变更、禁止活跃引擎恢复宽规则等既有事务；新脚本只允许固定三个端口并使用独立版本/规则前缀，不能解释旧窗口状态。只读Check和5.1/7模拟反例先通过，真实Apply仍由维护者执行。

两个受管实例沿现有UI及每次许可启动；独立对照引擎固定display102，保持相同访问控制和私有随机认证文件，不传cookie、不加-ac、不自动登录。原始句柄和监听归属区分受管与独立对照，不通过全局进程名停止。远端独立只读观察器持有已观察进程pidfd，记录session/cgroup与PID1/服务身份；停止XDM后仍保持WSL存活，直到检查和明确结束观察。发现残留先记录，不停止整个UID以获得虚假PASS。工具只用于本机联调，不进入产品入口或构建产物。

## 当前续作：本机临时防火墙窗口（2026-10-31，已授权）

一次性脚本和机器级回滚快照仅放 `.trellis/.runtime/`，不进入产品或提交。按精确规则 Name 和配置快照核对两条原规则，先持久化回滚凭据再禁用；临时规则仅单个 IPv4 来源/本机地址、WSL 接口和单个 TCP 端口，不开放 Windows UDP177 或整段 display 端口。检查程序 hash、动态 NAT 拓扑、端口占用及有效防火墙策略。Apply 需管理员、前台最多 30 分钟，异常也进入恢复路径；Restore 可在进程意外终止后单独执行。恢复先撤销临时允许，发现并发配置变更不覆盖；若引擎仍活跃，不重新启用宽规则，保留恢复凭据并要求先关闭引擎再恢复。脚本不停止未知进程，不自动操作许可或登录 UI。无管理员环境只能做只读与 mock 反例，真实写入/回滚须另留证。

## 当前续作：隔离的 WSL XDMCP 靶机（2026-10-31）

现有 Ubuntu-24.04 为 systemd + WSL2 NAT，已有 Docker 业务服务，不改动这些服务。选择发行版 XDM 与轻量 XFCE 的必要组件；安装前审查维护脚本并暂时阻止包安装自动启动服务，保留既有策略。XDM 使用独立配置、空本地 Xservers、精确 LISTEN 与 Windows NAT 来源 ACL，禁广播/间接查询，保留 PAM 与 MIT-MAGIC-COOKIE-1。专用非特权测试账号初始锁定；密码只经人工交互设置，不输出到日志/仓库。测试服务手动启动、不 enable，停止后验证监听与所属进程消失。只保存去标识验收记录；包基线、机器地址和私有日志留本机。Windows 引擎仍需干净、来源已核验的开发输出，不恢复被杀软干扰的 prefix。

## 当前实现：Windows XDMCP 开发会话入口（2026-10-31）

本次授权先打通可操作链路，沿用已确认的统一会话入口及现有独立原生引擎窗口，不引入 WebView 嵌入或新的保存配置 schema。新建 XDMCP 开发会话只创建空白可关闭实例，不执行程序/探测网络；实际启动需填写数值 IPv4、明确选择本机原生引擎、确认外置程序与网络访问两项单次许可。参数原样验证，不额外接受引擎参数，不恢复或复用受杀软干扰的构建输出。

复用现有 Rsh 非 PTY 任务的工作区投影方式，以 `source:xdmcp` 作为临时 metadata 标记；私有懒加载 owner 持有 reservation、generation 和运行寿命。目标/路径/许可不进入标签、快照、历史、AI、MultiExec 或日志。普通终端的 split/clone/reconnect/terminal_close 明确排除此实例；重连只能在面板重新确认后启动新 generation。关闭必须等待晚到 reserve/start 以及原生 stop 成功；stop_pending 或清理失败保留 owner 与可重试标签。

面板保持原有紧凑共享表单、按钮与 token，双语/三主题并保持首屏 lazy boundary。先在现有 light-neutral 母版补可点击模拟，再落实同一动线；`ui-ux-pro-max` 初次未在安装入口找到，后续在既存 `.trellis/.runtime/ui-ux-pro-max-skill` 缓存找到并实际执行了表单可访问性/异步错误审查，结论见 `validation/development-entry.md`，不引入独立视觉体系。能力/状态通过 typed IPC 严格解析；`querying` 只描述已发起请求，不虚构 active/登录成功，不添加无证据的自动成功或登录超时。开发入口可用于真实人工联调，但没有引擎/靶机时，不将 fixture/UI 测试写成桌面互通。

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
