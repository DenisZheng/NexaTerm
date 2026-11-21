# Research: Windows XWin 资源权限与配置分发边界

- Query: 固定 XWin 资源能否找到精确授权依据；哪些缺口需要上游澄清或经审核的独立替换，而不是继续重复来源/hash 核对？
- Scope: mixed；仅调查 xorg-server 21.1.25 的 `hw/xwin/X.ico`、`XWin.exe.manifest`、`system.XWinrc`、`winresource.h`，另只读追踪配置消费路径。
- Date: 2026-10-31
- 状态：工程证据审查，不批准采用、分发或桌面能力。PR #89 的原生资源检查与本记录的权利判断相互独立。

## Findings

### 1. 本轮新增结论

1. `winresource.h` 有直接适用于本文件的完整宽松许可和姓名宣传限制，现有 `actual-permissive-notice-present` 记录有文件正文支持；后续要落实 notice，不应仅留一个 MIT 标签。
2. `X.ico` 的当前字节来自 2008 年一次明确的替换提交：提交正文写明由 Colin Harrison 从 X.Org logo 制作。来源已收窄到具体作者与基础图形，但该提交没有同时给出图标的独立授权或基础图形的许可链，仍不能关闭资源权限项。
3. `XWin.exe.manifest` 的初次引入和三次后续修改均可追到上游历史，初始文件和当前文件都没有独立授权文字。根 `COPYING` 和作者姓名只能作为线索，不能据此把该文件的授权范围补成已确认。
4. `system.XWinrc` 的样例作者及 2003 年原始内容、2010 年改名链已找到；初始样例和当前样例都只有作者名，没有独立许可授予。它还包含真实可执行的外部工具菜单，不能直接把这份“原样安装成功”的开发样例当作 NexaTerm 的产品配置。

因此，本轮可关闭的是上述文件的精确历史定位，不是三个未决资源的分发权限。三个未决项不应继续仅以“等待 CI”表示：CI 无法补出授权文字。

### 2. 固定对象与独立来源核对

本地只读源根为 `.trellis/.runtime/pr89-native/sources/xorg-server-21.1.25/`。其归档核验沿用 [source-review-evidence.md](source-review-evidence.md)，未重新编译或执行任何上游程序。

本轮读取官方 GitLab API 的 [21.1.25 tag](https://gitlab.freedesktop.org/api/v4/projects/xorg%2Fxserver/repository/tags/xorg-server-21.1.25)：其 commit 为 `edc1b378f804ef5bf286318057e0b935f91f22b7`，annotated tag target 为 `1066510cc7a18ecdb10953ce7eeb085995e1b1a4`。这次 API 查询没有独立重验 tag 签名，不混同既有归档签名证据。

随后从该 commit 的官方文件 API 读取四份原始内容，在内存解码并计算 SHA256，全部与本地固定归档中的字节相同：

| 上游相对路径 | 字节数 | Git blob / SHA256 |
| --- | ---: | --- |
| `hw/xwin/X.ico` | 25214 | `5d69818b52076b9d4ce51e82552650235fdc6a02` / `84ff9b2eb8ce3c3f26072fa367860989f8c900b1fd0aefda6d6f6f1af3ff3597` |
| `hw/xwin/XWin.exe.manifest` | 1395 | `bd44b10668457a2e49e6f01c2e9a587446cd9ef4` / `2cdb7dbcfe5fb3dbe13ca333388a1950edb12da0437505b523a8e15543e9dee9` |
| `hw/xwin/system.XWinrc` | 3581 | `fb44be37d318d3bf4dd8afe401112c18874c7591` / `ca65e3afdbdf8a601dc5ffee469529070218a1490c0fa268e95a72cd5dc87c73` |
| `hw/xwin/winresource.h` | 1763 | `37e92ce61cc84affb3625b8423d1b48f6c11061b` / `171ef5721d16964e0c8ccdb94eddbcc665df1cea8990b712e52c723b377ba4bb` |

复核入口：`https://gitlab.freedesktop.org/api/v4/projects/xorg%2Fxserver/repository/files/<URL-encoded-path>?ref=edc1b378f804ef5bf286318057e0b935f91f22b7`。读取 `content` 原始字节并与 `blob_id`、`content_sha256` 和本地文件对比；不能使用网页渲染文本的 hash 替代文件 hash。

### 3. 逐项授权依据与下一步

#### R1：winresource.h —— 文件许可已找到，notice 落实仍待打包

[固定文件](https://gitlab.freedesktop.org/xorg/xserver/-/blob/edc1b378f804ef5bf286318057e0b935f91f22b7/hw/xwin/winresource.h) 第 4–30 行包含 Harold L Hunt II 的 2002–2004 版权声明、使用/修改/分发/再许可授权、版权和许可声明保留条件、完整免责声明，以及未经书面授权不得使用其姓名宣传的条件。它不只是相邻文件或仓库根部的一般说明。

最后修改为 [`c03f9e23c2b75af410b2fc76ca3f1aa9e979dcc4`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/c03f9e23c2b75af410b2fc76ca3f1aa9e979dcc4)，2013 年新增 PRIMARY selection 控制常量；当前文件保留了原始声明。

处理：后续发行 notice 保留本文件的精确版权、许可、免责声明和姓名使用条件；本轮不创建发行 notice，不声称相同声明自动覆盖 `X.ico` 或 manifest。`IDI_XWIN` 第 38 行为资源 ID 101，是现有图标消费契约而不是图形权利证明。

#### R2：X.ico —— 已定位当前图形的作者和来源，权限链未补齐

官方当前文件的 `last_commit_id` 为 [`3db60add6671f766f9360e7d03492dfd51eba225`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/3db60add6671f766f9360e7d03492dfd51eba225)，2008-12-15。提交正文是：

> Update the native icon for the X server to one created from the X.Org logo by Colin Harrison.

本轮另读取该历史 commit 的 `X.ico`，其 25214 字节和 SHA256 与 21.1.25 完全一致；这不只是标题相似或作者姓名推断。该提交的 diff 只替换二进制图标，没有随附图标许可文件。

未证明：作者对这份 ICO 的精确授权、基础 X.Org logo 的许可及图形/名称使用范围。不能把网站上的另一个同名 SVG、第三方重绘图的 CC/GFDL 标签或网络讨论中的商标判断套给本 ICO；也不能把“图形简单”当成自行认定公有领域的依据。

下一可执行处理：用此 commit、blob 和 SHA256 向上游确认精确图标授权及基础图形来源；若无法取得可审阅依据，另行评审用项目自有、非衍生于该 logo 的图形替换。替换不是本轮授权，必须保留资源 ID、ICO 格式和最终 PE 资源检查，并显式记录新来源，不能为跳过权利审查而删除校验。

#### R3：XWin.exe.manifest —— 引入链已确认，不能从模板形态推定公有领域

初次引入为 [`c02638fd68440513b6046315547c554a910bd7e2`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/c02638fd68440513b6046315547c554a910bd7e2)，2010-02-02；作者 Colin Harrison，提交说明启用 Windows themed controls，带 Jon Turney 的 Signed-off-by。该 commit 新增的 16 行 manifest 没有许可声明。

随后可见的文件历史是：

- [`e2e6fab1efa6895256ac0ed4d5b054a88ad18077`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/e2e6fab1efa6895256ac0ed4d5b054a88ad18077)：增加 DPI-aware 声明。
- [`80054fcafb095aff76f6df00d348c7fd85e8ddbc`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/80054fcafb095aff76f6df00d348c7fd85e8ddbc)：架构从 X86 改为 `*`，并补资源依赖。
- [`234fe391802b114e96d60a6630f717f8e4fb726c`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/234fe391802b114e96d60a6630f717f8e4fb726c)：通用描述与 Windows 兼容性声明；为当前文件的最后修改。

未证明：根 `COPYING` 中哪一段由权利人明确覆盖该文件；Signed-off-by 和 review 记录不是独立许可文本。当前固定 `COPYING` 有多个历史版权和不同条款，包含 Colin Harrison 名字，不等于能按姓名完成逐文件授权映射。

下一可执行处理：先向上游核实其对此精确 manifest 的适用授权；另一条可评审路线是按功能需求独立编写项目 manifest。后一方案必须重新验证 Common Controls、DPI、架构、OS compatibility 与最终资源 type/name，不应把本文件复制后仅修改版权头当成独立创作，也不能删掉 manifest 让 provenance 检查失去目标。

#### R4：system.XWinrc —— 原始样例没有许可正文，且不是产品最小配置

当前文件第 1–2 行说明它是 EXAMPLE，署名 Earle F. Philhower, III，没有版权条件或许可授予。

官方 [`11252ed82e1f361b99e86521ac9314f868bd1a3a`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/11252ed82e1f361b99e86521ac9314f868bd1a3a) 显式将 `hw/xwin/_usr_X11R6_lib_X11_system.XWinrc` 改名为 `hw/xwin/system.XWinrc`，增加安装规则并修改注释中的路径。沿旧路径读取 2003-11-25 的 [`90f1536dd315cd265bfc7ef35058761a65a01734`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/90f1536dd315cd265bfc7ef35058761a65a01734) 时，原始样例同样只有作者署名，没有许可条款：2720 字节，blob `dbd79f2bf23aa777b8f9c1aec53219dfa5cbc9f7`，SHA256 `df626e432ff629f059d6e60f6f9c20f3211c7bb14059a31cd1adeae6402a128a`。2003-11-26 vendor merge 中的旧路径内容相同。

当前最后修改为 [`bcf2dd0cd20825ccf4284c67f678ad37ecd1d2b1`](https://gitlab.freedesktop.org/xorg/xserver/-/commit/bcf2dd0cd20825ccf4284c67f678ad37ecd1d2b1)，2016 年补图标路径说明。

相邻 `winprefs.c` 虽把 Earle 列为作者并具有 XFree86/Colin Harrison 许可正文，但没有明确把独立样例文件纳入其授予范围；本轮不以同一作者或相邻位置补齐授权。

下一可执行处理：向上游确认旧路径和当前样例的许可范围；产品化时另行评审独立编写最小配置更能避免不需要的菜单/程序引用。若改变安装配置，必须同时修改相应设计、固定来源清单与资源审查契约，不能静默绕过当前原样安装检查。

### 4. 配置内容与打包边界：不扩大运行依赖

以下行号来自同一固定 21.1.25 源码，不是对实际桌面运行的观测：

| 位置 | 静态可确认事实 | 后续验收/打包含义 |
| --- | --- | --- |
| `hw/xwin/Makefile.am:145` | `system.XWinrc` 作为 `xwinconfig_DATA` 安装 | 开发安装清单含样例不等于它已被批准进入 NexaTerm 包 |
| `hw/xwin/system.XWinrc:80` | 活动菜单引用 `xterm`、`emacs`、`notepad`、`xload -display %display%`；另有 xterm 专用菜单 | 这些是用户触发的菜单动作，不是读取配置时自动启动；不得为了让样例菜单可用而自动扩大发行依赖 |
| `hw/xwin/system.XWinrc:113` | `IconDirectory`、`reinstall.ico`、`uninstall.ico` 均在注释示例中 | 不把注释中的 ICO 当作当前活动图标或实际缺失依赖 |
| `hw/xwin/system.XWinrc:121` | 当前样例启用 `SilentExit`，并有解析完成 DEBUG 文案 | 退出/取消是否符合产品要求应在真实引擎验收中核对，不能仅检查字节相等 |
| `hw/xwin/winprefs.c:300` | 菜单命令处理函数的 MinGW 分支通过 `CreateProcess` 执行 `CMD_EXEC` 参数；Cygwin 分支不同 | 不将 Cygwin shell 命令语义推定为本项目 UCRT64 语义，不实际执行这些菜单 |
| `hw/xwin/winprefs.c:706` | 先尝试 `$HOME/.XWinrc`，未成功才尝试 system 配置；system 路径取决于 `RELOCATE_PROJECTROOT` 或 `SYSCONFDIR` | X2 需验证实际构建路径、隔离测试 HOME 与用户配置优先级，不改维护者的真实配置 |
| `hw/xwin/winprefs.c:670` | 包含 xterm/man 的内置 fallback 只位于 `#ifdef __CYGWIN__` 分支 | 不能把该 fallback 描述为 UCRT64 下必然存在；缺配置时的实际 MinGW 行为仍需本平台验证 |

仅凭源文件存在不能证明某个运行模式一定显示上述菜单；需要结合实际参数、构建宏和原生 GUI 观测。当前记录不启动 XWin、不改配置，也不把菜单引用视为 XDMCP 登录成功证据。

### 5. 已找到的文件、代码模式与相关规范

- `scripts/xserver_windows_resources.py` 的 `resource_compiler_evidence` / `RESOURCE_SOURCE_ANCHORS`：要求固定 RC、manifest、ICO、配置锚点；属于身份核对而非许可批准。
- 同函数的 `RESOURCE_HEADER_NOTICE`：读取 `winresource.h` 的真实许可；对应 R1。
- 同函数的 `RESOURCE_SYSTEM_CONFIG_IDENTITY`：要求安装后的 `system.XWinrc` 与固定源字节一致；任何独立替换都必须作为后续显式契约变更处理。
- 同函数的 `unresolvedRights`：继续保留三个未决资源；本轮没有修改或放宽它。
- 上游 `hw/xwin/XWin.rc:33` 包含 `winresource.h`，第 108–109 行将 ICO 与 manifest 编入资源；消费关系不构成相邻文件的交叉授权。
- `.trellis/spec/backend/xserver-windows-resources.md`：来源与资源字节必须可追踪；权限、分发和桌面仍分别判定。
- `docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md:64`：候选与来源调查不是采用决定，未解决的许可条件不得静默放宽。

## External References

- [X.Org 官方 License guide](https://www.x.org/archive/current/doc/xorg-docs/License.html)，页面正文日期 June 2012；本轮读取其明确要求逐文件/包检查精确 redistribution terms，不把它当作 21.1.25 的逐文件授权清单。
- [Cygwin/X FAQ §12.2、§12.5](https://x.cygwin.com/docs/faq/cygwin-x-faq.html)：官方说明 X source “generally” 使用 X11-style license，并明确每个文件的作者可能保留或转让版权，必须检查具体文件。FAQ 的一般性表述不解决 R2–R4；本项目也不是采用 Cygwin 运行库。
- [21.1.25 的固定源码树](https://gitlab.freedesktop.org/xorg/xserver/-/tree/edc1b378f804ef5bf286318057e0b935f91f22b7/hw/xwin) 与上文逐项 commit 链是本轮具体内容与历史的依据。

## Caveats / Not Found

- 本轮读取的 `hw/xwin` 顶层未发现单独 `COPYING`、`LICENSE` 或为上述三资源声明范围的 README；根 `COPYING` 是多种历史许可汇总。这里的“未找到”是调查结果，不是断言这些资源没有许可或禁止使用。
- 官方 cgit 请求返回 503 后改用同一上游官方 GitLab API；不使用 GitHub 第三方镜像作为最终依据。网络文件均只在内存读取，未下载或复制外部实现到仓库。
- 查到关于 X logo 的历史邮件，但作者明确不代表 X 项目；未把个人意见作为本 ICO 的授权证明。也未采用第三方同名重绘 SVG 的授权推定。
- 本轮没有代替维护者或法律专业人员作采用批准；没有自动联系作者、提交上游问题、执行样例命令、改变资源、修改安全设置或重新启动本机构建。
- `distributionApproved=false`、`bundled=false`、`desktopVerified=false` 继续保持；本记录也不声称四个预编译 DLL 的内部来源/许可已经完成。
