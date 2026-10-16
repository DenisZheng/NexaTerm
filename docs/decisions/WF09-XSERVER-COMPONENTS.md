# WF-09-07 X0：X server 组件筛选记录

2026-10-16。状态：选型进行中；**尚未批准发行组件，尚无 bundled 产物**。X1 开发运行核心独立推进，不以外部引擎验证冒充内置目标完成。

## 已核对的来源与决定

| 来源 | 当前核对结果 | 本次采用决定 |
| --- | --- | --- |
| X.Org 官方 xserver 发布目录 | 2026-10-07 发布21.1.25；将其作为后续源代码/构建审查基线，不再从旧21.1.16起步 | 未下载、未计算归档哈希、未构建；不是可分发 manifest |
| VcXsrv 官方仓库 | Windows 原生实现候选，聚合仓库标 GPL-3.0，不能把核心源于 X.Org 等同于整包 MIT | 不复制代码、不引入二进制；许可策略/具体依赖未获采用决定 |
| Cygwin/X + Cygwin | XWin 与 Cygwin 运行库必须分别审核；API 库为 LGPLv3+，工具许可另计 | 不引入发行运行库；不能在现有工程约束下静默采用 |
| XQuartz | 官方发行2.8.6（2026-07-14），组件许可混合；quartz-wm 为 APSL2 | macOS 候选，未验证私有 app bundle/签名或真实 query；未引入 |

## 下一项可执行工作

对21.1.25精确源归档做哈希/签名验证和逐组件审查，确定 Windows XWin 编译所需运行库及许可；若原生 Windows 构建需要候选下游修改，先审查对应文件而非直接复制聚合仓库。产出实际构建依赖图和组件/许可证/哈希/签名清单后，才能决定可分发方案。此处没有宣称现成、纯宽松许可的 Windows 全套已经找到。

同时完成 X1：受管原生进程、固定 query 参数、独立 display、瞬态认证文件、取消及关闭回收，使用仓库自编译的 native fixture 验证。fixture 不实现 X server，也不证明 XDMCP 互通。X2 仍必须交付随包程序和真实桌面；X3 逐平台记录。

## 一手资料

- [X.Org 官方归档](https://xorg.freedesktop.org/releases/individual/xserver/)：21.1.25 源码归档和签名文件。
- [X.Org 许可证指南](https://xorg.freedesktop.org/archive/current/doc/xorg-docs/License.html)：按文件/包核对。
- [VcXsrv 官方仓库](https://github.com/marchaesen/vcxsrv)：聚合许可和构建分支说明。
- [Cygwin 官方许可](https://cygwin.com/licensing.html)：API 库与工具、链接例外。
- [XQuartz 官方发行与许可](https://www.xquartz.org/)：版本与混合许可。
- [Windows 官方 JobObject/CreateProcess 接口](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/System/JobObjects/index.html)：X1 创建后先归属 job 再 resume；本项目使用锁定的 windows0.61.3，实际编译由 CI 核实，不直接假定在线0.62接口完全一致。
