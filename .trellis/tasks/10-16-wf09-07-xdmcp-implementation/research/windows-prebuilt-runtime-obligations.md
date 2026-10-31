# Research: Windows 预编译运行库的来源与分发闭合条件

- Query: 四个基线预编译 DLL 还缺哪些实际内部证据、notice 和源码供给材料；哪些工作不必等待 PR #89 的原生构建？
- Scope: mixed；只读既有记录、官方归档/固定源码与许可原文，不执行编译器、构建或 DLL。
- Date: 2026-10-31
- 状态：补充审查证据，不批准组件采用或分发；`distributionApproved`、`bundled`、`desktopVerified` 均不改变。

## Findings

### 1. 本轮新增结论，不重复旧的包名/hash 核对

1. 已将四个基线发布归档内的 `.BUILDINFO.pkgbuild_sha256sum` 与实际固定 `PKGBUILD` 原文字节绑定。**pixman 的原记录所引用配方不是该发布包的精确构建配方**：版本仍为 `0.46.4-3`，但后续删掉 `mingw32` 架构后配方 hash 已变。本轮找到了 hash 精确匹配的 `82bcf47d0ae2621e1cd00fb82c8ee5db02b91955` 配方；不应把“同版本、同构建步骤”写成同一配方字节。[R1][R2]
2. 四个发布包不是在同一 SDK/GCC 环境构建。pixman 使用 GCC `16.1.0-3`/CRT `14.0.0.r37.g2bfe61fba-1`，zlib 使用 GCC `15.2.0-13`/CRT `13.0.0.r551.g5595a0ef4-1`。**当前 XWin 的 SDK/CRT 成员核对不能直接覆盖这些预编译 DLL 的内部输入。** `.BUILDINFO` 只证明构建环境声明，不证明每个已安装包都被实际链接。[R1]
3. 基线 `libwinpthread-1.dll` 确有 `.rsrc`，不是纯假设的审查项；它的固定源码 `src/version.rc` 带有实际 MIT 权限声明。源码还通过 `fakelib` 处理 bootstrap 循环依赖，固定 MSYS2 补丁增加 `dll_frame_info.c`。内部审查应具体覆盖该资源与 fake-libgcc 链，不能仅检查外部 import 表。[R3][R4]
4. 本机私有 MSYS2 已出现版本漂移：`libwinpthread` 为 `14.0.0.r569.g34eeafb7d-1`，zlib 为 `1.3.2-3`，不是本文基线。PR #89 的最终实际 provider 集合仍须以该提交 CI artifact 为准；不能把本机或旧包结果代填为新 CI 的结论。

### 2. 现有代码证明到哪里

| 文件与入口 | 当前真实契约 | 本轮判断 |
| --- | --- | --- |
| `scripts/xserver_windows_inventory.py:34` `package_evidence` | 读取安装包版本/声明、已安装许可文件 hash、缓存归档 hash | 没有读取 `.BUILDINFO` 绑定精确配方，没有独立验证包分离签名；缓存存在不代表对应源码已备齐 |
| `scripts/xserver_windows_inventory.py:68` `add_runtime_provenance` | 将实际 PE 闭包项绑定安装 owner/package | 证明哪个 DLL 由哪个包提供，不证明 DLL 内部静态对象 |
| `scripts/xserver_windows_private_links.py:57` `private_linkage` | `target-toolchain` DLL 明确放入 `prebuiltDllsExcluded`，只追私有构建目标的 map/member | 既有 XWin/私有 DLL 的成功不能越过这一排除边界 |
| `scripts/xserver_windows_resources.py` `resource_compiler_evidence` | 资源报告继续保留 `prebuiltDllInternalsIncluded=false` | 不能将 XWin/private 对象的资源扫描说成四个预编译 DLL 的资源审查完成 |

本轮没有修改这些契约。对应规范为 `.trellis/spec/backend/xserver-windows-private-links.md`、`.trellis/spec/backend/xserver-windows-resources.md`。历史背景为 [windows-runtime-license-review.md](windows-runtime-license-review.md)、[windows-private-links-evidence.md](windows-private-links-evidence.md) 与 [windows-resource-evidence.md](windows-resource-evidence.md)。其中旧文的 XKB 未完成描述只属于其历史基准，不是当前任务状态。

### 3. 发布归档到构建配方的新增绑定

方法：原生 Windows Python 只读缓存或将官方归档下载到内存，先匹配既有归档 SHA256，再通过系统 `tar.exe -xOf` 仅向内存读取 `.BUILDINFO`、`.PKGINFO` 和目标 DLL；没有解包运行程序，没有执行 `PKGBUILD`。逐个核对 `.PKGINFO` 的精确包名/版本，并读取完整 `.BUILDINFO`。基线包 URLs 为 [R1]。本轮不重复宣称独立签名验证通过。

除 pixman 外，固定配方 commit 为 `fb1bee30b4f11cf4b857197a288466afad49033a`；本轮读取的原始内容均与下表 `.BUILDINFO` 声明相同。

| 包/版本 | `.BUILDINFO` SHA256 | 精确 `PKGBUILD` SHA256 |
| --- | --- | --- |
| libgcc `16.2.0-6` | `7fdf767ea43f83f4d49e9430342821c1d89f3a414a591ee74d46c7d5090dcfa9` | `1a123ea062e01beb611c4375999492b0f41ef2d92d03e38cb29e7c23e855ad45` |
| pixman `0.46.4-3` | `09bc09578a081ffc5bf420e250f881b5b9257f74d26ff45d00706eeca0d74f1f` | `b1a58a74281f8b2ab72986d745249590238dfeed1dd2fca811b362fa7d582ea4`；精确 commit 见 [R2] |
| libwinpthread `14.0.0.r495.g63ebe6cdb-1` | `0444fdb05715f62df15b9a9b8cb7792ea4f865c14dd729b06f103092951c481e` | `1ed2e13d4e8b360c72be2063c1045b8c4f3a0bc4b35dec8b6932581d2e8ad2e8` |
| zlib `1.3.2-2` | `fdad29bf34766da93b0f880078e5d282202e45ab5e00785b0b1d7e02d3aa1c18` | `8a4a54a964eab7efa313e2faa8267052bc237ef61f8adf82a55cc93f4028db8a` |

pixman 原来引用的 `fb1bee30` 配方 SHA256 是 `97042b1ecdb036953c71b34a61cf1b8431b7fc7d9860f621793ec1a1a72c3d93`，与发布包声明不同。GitHub 官方路径历史给出 `82bcf47d`，逐字节匹配成功；后来的 `f6ae36581d8dd1f6878442575cc8471830b863ed` 移除 `mingw32` 而未改 `pkgrel`。此差异本身不证明 UCRT64 产物错误，但必须保留精确身份边界。

| 发布包 | `.BUILDINFO` 声明的 GCC / CRT / binutils | 能否用当前 XWin 取证代替 |
| --- | --- | --- |
| libgcc | GCC `16.2.0-5`；CRT `14.0.0.r426.g4564ee4b5-1`；binutils `2.47-4` | 不能；bootstrap 安装环境与输出包版本不同，须读取实际构建规则/产物输入 |
| pixman | GCC `16.1.0-3`；CRT `14.0.0.r37.g2bfe61fba-1`；binutils `2.46-2` | 不能；现有 CRT `r495` 身份记录不覆盖这个内部集合 |
| libwinpthread | GCC `16.2.0-6`；CRT `14.0.0.r495.g63ebe6cdb-1`；binutils `2.47-4` | 不能；仍缺该 DLL 自身实际选中对象与 resource 链 |
| zlib | GCC `15.2.0-13`；CRT `13.0.0.r551.g5595a0ef4-1`；binutils `2.46-2` | 不能；不同构建世代，需独立追踪 |

四个归档的完整成员列表分别有 11/19/10/21 项，未包含以 `.map`、`.Po`、`.Plo`、`.d` 结尾的链接/编译依赖文件。它们均声明 `strip`、`!debug`、`!lto`；这不是全部编译参数/实际链接证据，也不能只据 `!lto` 完成 RLE 条件审查。

### 4. 内部范围已有的具体线索

| 候选 DLL | 本轮已确认 | 仍不能确认；应取得的证据 |
| --- | --- | --- |
| `libgcc_s_seh-1.dll` | 固定 split 配方的 `package_libgcc` 安装输出并调用 `_install_RLE`，后者同时安装 `COPYING3` 和 `COPYING.RUNTIME`；包依赖声明含 libwinpthread | 实际 runtime 主源/静态 CRT/生成输入的最终集合与具体例外适用；需要该 DLL 的链接输入和固定源码/补丁对应关系，不能用 XWin 中两个 libgcc archive 成员代表 DLL 全体 |
| `libpixman-1-0.dll` | 精确配方构建 shared/static；固定源 `pixman/meson.build:66` 创建按检测选择的 SIMD 静态库，`:125` 将其链接入主库 | 哪些 SIMD 条件实际启用、最终静态 CRT/GCC 成员和配置头；需要旧工具链构建信息、`build.ninja`/编译命令、实际 map/member，不把完整源列表当最终成员集合 |
| `libwinpthread-1.dll` | DLL 68731 字节，SHA256 `a5df05bf091bc2ba0a89f83a60d2049e9d434bb9631fec82faf20ff64a53456a`；PE 节表 `.rsrc` raw size 1536，virtual size 1152，raw SHA256 `0552c79d58af45c56efb5dd4d43cdcffc34f4f77f9d75ab4ccb114579ac2805e` | 未复现资源段、未证明最终资源树仅含版本项；须从实际 windres 输入、SDK `winver.h`、`wpth_ver.h` 追到 PE 资源，并检查 fakelib 的真实选中成员 |
| `zlib1.dll` | 固定配方将 zlib shared 构建与 `contrib/minizip` 分开，后者才显式设置 `-lbz2`；`package_zlib`/`package_minizip` 分别安装 | `makedepends=bzip2` 不能据此把 bzip2 认作 zlib1.dll 内部成分，也不能只据分包规则断言绝无贡献；仍以该 DLL 的真实链接输入为准 |

补充锚点：[R3] 的 winpthreads `Makefile.am` SHA256 `467faeff657654a97a31a893e7f701efe351c8ad7c583d7af4f4671d7b38287d`，明确列出 `src/version.rc` 及 `-L$(builddir)/fakelib`。资源源码 2524 字节，SHA256 `de400c09bf47f2e460cc08733307640ddfc420336745d40eb4c9fcfef68ba27a`，带独立 MIT 声明。新增 fake-libgcc 源的包装补丁 1789 字节，SHA256 `2e779bcc60a1422b23e0cfdb5c0f6851f2382592bb4675d08a6bdef78d5e5c10`，补丁中新文件没有独立许可头；可保留包仓库 BSD 原文和来源，但不能仅由补丁位于仓库就标为已批准。

### 5. Notice 与源码供给：文字义务和工程策略分开

以下是待采用候选的审查输入，不是法律意见或工程师代替维护者签署的采用决定。现有 [运行库许可记录](windows-runtime-license-review.md) 已保存五份原文的固定 hash，本轮重新读取官方原文，不复制成另一套完整 license 文本。

| 候选 | 应落实的材料与条件 | 不可采用的捷径 |
| --- | --- | --- |
| libgcc | 保留完整 GPLv3 与 RLE3.1，逐文件确认附加许可适用；分别审查 Independent Modules、Target Code、Eligible Compilation Process，以及独立 runtime DLL 本体的分发方式。若人审选择随包分发，应准备与精确 DLL 对应的源码、补丁、配置及构建/安装控制脚本，并选定 GPLv3 §6 的供给途径 | “RLE 存在所以 DLL 本体无需源码”“动态链接所以无义务”“项目要开源全部自身代码”均不是本轮可推出的结论 |
| pixman | 保留上游完整 `COPYING` 的多版权方、permission 与免责声明；按实际进入产物的文件继续查独立条件。其开头写的是由多数贡献者同意的 MIT 文本，不是对任意未核实文件的 blanket 证明 | 不压缩成一个 MIT 标签，不把 host `libpng`/Meson 等整个 build dependency 集合作为运行分发清单 |
| winpthreads | 保留完整 `COPYING`，包括 MIT 与 Lockless BSD-3-Clause；二进制分发文档/材料保留 BSD 版权、条件、免责声明及无背书要求。`src/version.rc` 的 MIT 声明明确；包装补丁的来源/权利范围另审 | 不能只保留第一段 MIT，不能由 PE 中 `Licence=MIT AND BSD-3-Clause` 字符串代替 license 原文 |
| zlib | 许可原文要求来源不被歪曲、修改的源码明确标识、源码分发不移除/修改 notice。保留实际官方 patch 集及修改说明；项目可将完整 `LICENSE` 随包作为一致的审计策略 | zlib 文档 acknowledgement 是 appreciated but not required，不能写成许可证强制要求；Zlib 文本本身没有与 GPLv3 相同的源码供给义务 |

GNU 官方 FAQ [R5] 明确说静态/动态组合不改变例外的条件，并以**独立分发 libstdc++**说明库本体对象代码仍按 GPLv3 §6 供给源码。这是区分库本体/组合输出的官方解释，不应改写成 FAQ 逐字裁定了 NexaTerm 的 libgcc 分发案。

GPLv3 §1 的 Corresponding Source 包括生成、安装及修改工作所需源码和控制脚本，并明确排除符合定义的 System Libraries、通用工具等。[R6] 因此不把“提供整个开发机器所有包源码”当默认要求，也不只提供裸 `gcc-16.2.0.tar.xz` 而遗漏实际 MSYS2 patches/configure 配置。原始完整归档可先作为保守的审查素材集合，再由人审确认哪些属于该 runtime 的 Corresponding Source。

若最终选择基于下载页的 §6(d) 方式，原文要求在对象代码旁提供清楚的源码获取指引、等价获取能力及无额外费用；源码可在第三方服务器，但分发者仍承担确保可用的责任。[R6] 推荐在采用决定中明确对应源码资产、维护责任与可用性验证，不只链接 MSYS2 首页。是否触发 User Product/Installation Information 条件须结合最终发行形式单独判断，不在此自动豁免或承诺。

### 6. 不改依赖/链接方式的下一项执行清单

| 顺序 | 输出与完成判据 | 状态/依赖 |
| --- | --- | --- |
| B0 实际身份重绑 | 等 PR #89 精确 SHA 的 JSON，读取 `privatePeLinkage.prebuiltDllsExcluded`、PE hash、package/version；只对与本文基线完全相同的项复用证据，不同版本建立新行 | 等新报告；本机 `r569`/zlib `-3` 已证明不能假定版本不变 |
| B1 配方来源 | 每项保存归档身份、`.PKGINFO`、`.BUILDINFO`、其声明的精确 `PKGBUILD` hash、固定 source/patch manifest 与构建环境；独立包签名链另列 | 本文完成四个基线的配方绑定与环境差异；新版本及签名仍待补 |
| B2 内部实际贡献 | 优先向原构建记录索取与发布 DLL 精确绑定的 map、选中 archive/object、编译 depfiles、生成资源输入；本机不重跑。若来源不能提供，另评估在授权干净环境按旧精确环境重建并证明产物身份；不以仅同版本重建冒充同一 DLL | 这些材料不在本次四个发布包中；不能靠新增文本断言关单。重建/替换分发候选是后续明确决策，不在本轮实施 |
| B3 可审阅分发材料 | 对确认候选生成“DLL hash → 完整 notice → 精确 source/patch/build materials → 供给 URL/方式/责任人”的清单；为 libgcc 单列项目许可策略与 §6 方式的批准记录 | 可先整理模板及已知原文，不需要等桌面；不得先把 `distributionApproved` 改为 true |
| B4 包内核验 | 首次打包时核对实际 DLL/notice/source 指引与获批清单一致，包含包版本漂移的拒绝测试；桌面和签名独立验收 | 依赖 B0–B3 与采用决定，本轮不创建安装包 |

本机版本漂移来自只读安装数据库 `var/lib/pacman/local/<package>/desc`，不是推测：libwinpthread `r569` 的 desc SHA256 `cf7dfbbb265d0333eb166689e27d967a8aa99f773c63b9dc03b548e4bb9b4804`，zlib `1.3.2-3` 的 desc SHA256 `27c3c67be66bedde1dbd493a1f05b17547b515c43859da11017cc09e5a1dd953`。这只记录本机状态，不声明 CI 使用相同版本。

## External References

- [R1] 官方基线发布归档：[libgcc 16.2.0-6](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-libgcc-16.2.0-6-any.pkg.tar.zst)、[pixman 0.46.4-3](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-pixman-0.46.4-3-any.pkg.tar.zst)、[libwinpthread r495](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r495.g63ebe6cdb-1-any.pkg.tar.zst)、[zlib 1.3.2-2](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-zlib-1.3.2-2-any.pkg.tar.zst)。归档 hash 延用已独立核对的基线，本轮下载/读取重新匹配。
- [R2] 精确配方：[GCC](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-gcc/PKGBUILD)、[pixman 真正匹配 .BUILDINFO 的版本](https://github.com/msys2/MINGW-packages/blob/82bcf47d0ae2621e1cd00fb82c8ee5db02b91955/mingw-w64-pixman/PKGBUILD)、[winpthreads](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-winpthreads/PKGBUILD)、[zlib](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-zlib/PKGBUILD)；pixman 后续变更 [f6ae3658](https://github.com/msys2/MINGW-packages/commit/f6ae36581d8dd1f6878442575cc8471830b863ed)。
- [R3] 固定 SDK `63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296` 的 winpthreads：[Makefile.am](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296/mingw-w64-libraries/winpthreads/Makefile.am)、[src/version.rc](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296/mingw-w64-libraries/winpthreads/src/version.rc)、[COPYING](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296/mingw-w64-libraries/winpthreads/COPYING)。
- [R4] 固定 [fake-libgcc 包装补丁](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-winpthreads/0001-Define-__-de-register_frame_info-in-fake-libgcc_s.patch)、[包仓库 LICENSE](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/LICENSE) 与 [README 许可声明](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/README.md)。
- [R5] [GNU 官方 Runtime Library Exception 3.1](https://www.gnu.org/licenses/gcc-exception-3.1.en.html)、[官方 FAQ](https://www.gnu.org/licenses/gcc-exception-3.1-faq.html)；实际版本原文 [GCC 16.2.0 COPYING.RUNTIME](https://github.com/gcc-mirror/gcc/blob/releases/gcc-16.2.0/COPYING.RUNTIME)。
- [R6] [GNU GPLv3 §1、§6](https://www.gnu.org/licenses/gpl-3.0.en.html)；固定 [GCC 16.2.0 COPYING3](https://github.com/gcc-mirror/gcc/blob/releases/gcc-16.2.0/COPYING3)。
- [R7] [pixman 0.46.4 官方源码归档](https://xorg.freedesktop.org/releases/individual/lib/pixman-0.46.4.tar.xz)：`COPYING` 及 `pixman/meson.build`，后者 SHA256 `aea06fe68512574fb26d896d054c90609be831503440ae1ba79eadf2f5e131a1`；[zlib v1.3.2 LICENSE](https://github.com/madler/zlib/blob/v1.3.2/LICENSE)。

## Caveats / Not Found

- 本轮调研时没有 PR #89 原生报告；同日随后取得的失败报告及局部 provider 观察见下一节。仍没有原生成功、实际 Windows 桌面互通、安装包或发行采用决定。
- 没有独立验证本轮四个包的分离签名或重新构建它们；本机缓存 `.sig` 与 pacman 已安装验证标记不能冒充本轮独立签名验证。
- `.BUILDINFO` 与配方是来源/环境证据，不是真实静态成员或运行行为证据；本报告不将 `prebuiltDllInternalsIncluded`、`perFileLicenseReviewComplete` 标为完成。
- 资源段读取仅证明特定基线 DLL 的节表与原始段字节；没有将源码 resource 编译重现、资源树解析与最终段映射合并宣称完成。
- 所有下载仅在内存读取或复用既有缓存，未持久化外部实现；未执行可疑构建链、未改防护/网络/权限、未写职责范围之外的项目文件。

## 同日补充：失败 CI 保留下来的实际 provider 集合

已取得 PR #89 `f46a5fb` / run `41158110445` 的失败 JSON；身份与失败根因见 [资源证据](windows-resource-evidence.md)。以下来自已完成的 `privatePeLinkage.prebuiltDllsExcluded` 与 `runtimePackages`，不是本机安装数据库，也不是完整原生通过：

| 实际 DLL | CI package version | DLL SHA256 | 与原基线的关系 |
| --- | --- | --- | --- |
| `libgcc_s_seh-1.dll` | `16.2.0-6` | `791ebf66e99c7c1b4ed3666468cec45a0172b4c8942ac6c84c3e9cab3e1b5270` | 版本号相同；后续仍按此 hash 与发布包材料绑定，不仅比较版本 |
| `libpixman-1-0.dll` | `0.46.4-3` | `12e693d94829f013e0bd7c042b30998b20e91ece7b6f4d5f075ddbb58b373c92` | 版本号相同；精确配方应使用本轮已纠正的身份，内部贡献仍缺 |
| `libwinpthread-1.dll` | `14.0.0.r569.g34eeafb7d-1` | `ee4f503512b09d7e2668518c41d6c176755a354523ae15aa4d36220c9cb31791` | 已换版本；r495 的版本资源/补丁观察不能直接套用 |
| `zlib1.dll` | `1.3.2-3` | `8ae7aeb0467763a1e271cd831ca8e2f7fd101602adb9923100ea26c6be2a559b` | 已换 pkgrel；旧 `-2` 的归档/构建环境不能当新包证据 |

该失败报告中的当前 CRT 也是 `r569`。这确认了必须按每次实际 provider 重绑的必要性，但不能把局部身份观察算成 B0–B4 或权限闭合；先修复资源重放，再以成功的新 run 集合确定后续范围。

## 同日收口：成功原生报告的 B0 身份重绑

代码 `61c019224093730a40137a67e2f967ef43b6f6bd` / 原生 run `41169134366` 已完整成功，artifact ZIP/JSON 独立核验见 [资源审查完成证据](windows-resource-evidence.md)。实际四项 `privatePeLinkage.prebuiltDllsExcluded` 的 name/package/version/size/SHA256 与前节失败 run 观察逐字段相同：libgcc 150537 字节、pixman 737775 字节、libwinpthread 73820 字节、zlib 121530 字节，SHA256 仍是表中对应值。

因此 **B0 已完成**：后续候选明确为 libgcc `16.2.0-6`、pixman `0.46.4-3`、libwinpthread `14.0.0.r569.g34eeafb7d-1` 和 zlib `1.3.2-3`。这不是 B1–B4 完成；r495/旧 zlib `-2` 的配方和内部资源结论不得挪到新版本，仍需新包的独立材料。libgcc/pixman 同版本项也只复用已实际核对的来源材料，不补出原本缺失的内部 map/member。

新加入的 `default-manifest.o` 是已固定包中的直接链接资源对象，不是四个预编译 DLL 之一；其来源/最终 PE 验证不清除这些 DLL 的内部排除。下一阶段优先补 r569/zlib `-3` 的精确源/配方材料，以及四个候选的原构建内部证据；重建/替换和 libgcc 分发策略须另外人审，不在本阶段自动实施。
