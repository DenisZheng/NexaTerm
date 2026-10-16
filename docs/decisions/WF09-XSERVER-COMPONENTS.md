# WF-09-07 X0：X server 组件筛选记录

2026-10-16。状态：选型进行中；**尚未批准发行组件，尚无 bundled 产物**。X1 开发运行核心独立推进，不以外部引擎验证冒充内置目标完成。

## 已核对的来源与决定

| 来源 | 当前核对结果 | 本次采用决定 |
| --- | --- | --- |
| X.Org 官方 xserver 发布目录 | 2026-10-07 发布21.1.25；将其作为后续源代码/构建审查基线，不再从旧21.1.16起步 | 未下载、未计算归档哈希、未构建；不是可分发 manifest |
| VcXsrv 官方仓库 | 已锁定审查 commit；顶层 COPYING 为 GPLv3，内部另有 X11/MIT、Apache-2.0 等文件许可，不能仅凭顶层标签给所有组件定性 | 逐文件/实际链接闭包审查中；不复制代码、不引入二进制；尚无整包采用决定 |
| Cygwin/X + Cygwin | XWin 与 Cygwin 运行库必须分别审核；API 库为 LGPLv3+，工具许可另计 | 不引入发行运行库；不能在现有工程约束下静默采用 |
| XQuartz | 官方发行2.8.6（2026-07-14），组件许可混合；quartz-wm 为 APSL2 | macOS 候选，未验证私有 app bundle/签名或真实 query；未引入 |

## 下一项可执行工作

对21.1.25精确源归档做哈希/签名验证和逐组件审查，确定 Windows XWin 编译所需运行库及许可；若原生 Windows 构建需要候选下游修改，先审查对应文件而非直接复制聚合仓库。产出实际构建依赖图和组件/许可证/哈希/签名清单后，才能决定可分发方案。此处没有宣称现成、纯宽松许可的 Windows 全套已经找到。

同时完成 X1：受管原生进程、固定 query 参数、独立 display、瞬态认证文件、取消及关闭回收，使用仓库自编译的 native fixture 验证。fixture 不实现 X server，也不证明 XDMCP 互通。X2 仍必须交付随包程序和真实桌面；X3 逐平台记录。

## Windows 源码审查快照

本轮只读取官方候选源码，未复制任何外部实现。审查固定在 `marchaesen/vcxsrv@d0a1eaf7ee15fcdf4f683388a88fec49078e6408`；下表是已读取的局部证据，不是最终 SBOM，也不是发行许可结论。

| 精确文件 | 已核对事实 | 尚需解决 |
| --- | --- | --- |
| [顶层 COPYING](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/COPYING) | GPLv3 文本 | 下游修改和缺少独立许可头的文件不能自动视为 MIT |
| [xorg-server/COPYING](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/xorg-server/COPYING)、[XWin InitOutput.c](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/xorg-server/hw/xwin/InitOutput.c) | 前者汇集多个 X11/BSD/SGI 等许可；后者有 Open Group 宽松许可头 | 不能据此覆盖所有编译单元或修改 |
| [pthreads/LICENSE](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/pthreads/LICENSE)、[NOTICE](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/pthreads/NOTICE)、[pthread.h](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/pthreads/pthread.h) | 此固定版本的 Pthreads4w 使用 Apache-2.0；头文件一致 | 纳入最终文件清单和 notice，不能凭旧 pthreads-win32 印象误判为 LGPL |
| [xlaunch/COPYING](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/xorg-server/hw/xwin/xlaunch/COPYING) | X11/MIT 风格许可及名称使用条款 | NexaTerm 自管启动，不需要把 launcher 当作必需运行组件；该文件不能授权其他无头文件 |
| [xdmcphostselect.c](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/xorg-server/hw/xwin/xdmcphostselect.c) | 当前文件没有独立版权/许可头；XWin makefile 明确包含它 | 尚未厘清适用许可，不复制、不编入 NexaTerm 发行资源；direct-query 范围也不能自动豁免其链接审查 |

[xorg-server/makefile](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/xorg-server/makefile) 给出了待核对的服务器链接闭包：XWin/GLX/clipboard、X11/xcb、pixman、Xdmcp、Xau、Xfixes、Xfont2/fontenc、Xinerama、zlib，以及 pthreads、FreeType、OpenSSL、Windows 系统库。额外构建目标还包含 xkbcomp、字体/键盘数据、Mesa/DXTn、launcher 和其他客户端工具；它们不能未经核对整包搬入。依赖出现于 makefile 不等于已验证最终 PE 导入表、所有静态对象或可移除性。

[HOW_TO_BUILD.txt](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/HOW_TO_BUILD.txt) 与 [buildall.sh](https://github.com/marchaesen/vcxsrv/blob/d0a1eaf7ee15fcdf4f683388a88fec49078e6408/buildall.sh) 的路线是 Visual Studio 2022 原生编译，配合 Perl、Cygwin 构建工具等；脚本明确构建静态 Pthreads4w。构建时使用 Cygwin 工具本身不能证明发行程序依赖 Cygwin DLL，也不能证明完全不依赖；最终以实际构建产物导入表为准。

当前下一步是缩小必要服务器/资源闭包，逐文件解决无许可头及下游修改，再形成可复现构建、完整 notice 和实际产物哈希。尚未执行该原生构建，尚未取得 XDMCP 真实桌面证据。此依赖只阻塞相关组件引入和打包；不阻塞已授权的独立协议核/fixture 开发。

## 一手资料

- [X.Org 官方归档](https://xorg.freedesktop.org/releases/individual/xserver/)：21.1.25 源码归档和签名文件。
- [X.Org 许可证指南](https://xorg.freedesktop.org/archive/current/doc/xorg-docs/License.html)：按文件/包核对。
- [VcXsrv 官方仓库](https://github.com/marchaesen/vcxsrv)：聚合许可和构建分支说明。
- [Cygwin 官方许可](https://cygwin.com/licensing.html)：API 库与工具、链接例外。
- [XQuartz 官方发行与许可](https://www.xquartz.org/)：版本与混合许可。
- [Windows 官方 JobObject/CreateProcess 接口](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/System/JobObjects/index.html)：X1 创建后先归属 job 再 resume；本项目使用锁定的 windows0.61.3，实际编译由 CI 核实，不直接假定在线0.62接口完全一致。
