# Windows X server 工具链运行库许可实证

状态：审查进行中，未批准随包/分发。范围为code6e1f8fd原生16实际递归PE集合中四个目标工具链DLL；固定X库、生成器、资源及其他编译/静态输入见[构建证据](windows-build-evidence.md)。不把整个私有prefix或编译器包当作发行清单。

## 实际DLL与固定包装来源

原生16记录了16个实际PE文件，其中下列四项来自UCRT64。包装配方统一核对到[MSYS2提交fb1bee30b4f11cf4b857197a288466afad49033a](https://github.com/msys2/MINGW-packages/commit/fb1bee30b4f11cf4b857197a288466afad49033a)；四个文件的实际git blob与读取内容逐字节匹配，版本与原生16已安装包相同。

| DLL / 包 | 实际版本 | 配方及git blob | 当前核对 |
| --- | --- | --- | --- |
| libgcc_s_seh-1.dll / libgcc | 16.2.0-6 | [gcc/PKGBUILD](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-gcc/PKGBUILD)，c633fccd531fc5a5c045a9e2d3c14cfda512868c | 运行库包实际调用_install_RLE，安装COPYING3和COPYING.RUNTIME；未按整个编译器统一批准 |
| libpixman-1-0.dll / pixman | 0.46.4-3 | [pixman/PKGBUILD](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-pixman/PKGBUILD)，3a7a1f0a82ef5ca0e7471e464934c61faad96ed9 | 声明MIT，复制上游COPYING；已读取固定官方归档的实际文本 |
| libwinpthread-1.dll / libwinpthread | 14.0.0.r495.g63ebe6cdb-1 | [winpthreads/PKGBUILD](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-winpthreads/PKGBUILD)，52e49b01a68abc3eafe707862f5b4c69e5f1768b | 明确MIT AND BSD-3-Clause；保留Lockless部分的独立条款 |
| zlib1.dll / zlib | 1.3.2-2 | [zlib/PKGBUILD](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-zlib/PKGBUILD)，ca7551cdeb1e21f33941efbf412b145f982d1b35 | 声明Zlib，复制上游LICENSE；保留来源、修改标识及notice条件 |

## 对应许可文本的字节身份

以下均已读取完整原文并计算SHA256。GitHub读取项另按`blob <size>\0<bytes>`核对git SHA1，未将网页渲染文本当作原始字节。原生17（codec2ca16f）的四包实际版本及五份已安装许可文件hash已逐项匹配以下原文；报告仍为FAIL，未用文本一致性覆盖后续静态来源门禁失败。四包的cachedArchives均为空，不声称已独立验证这些包的归档签名。

| 原文 | 字节 | SHA256 |
| --- | --- | --- |
| [GCC 16.2.0 COPYING.RUNTIME](https://github.com/gcc-mirror/gcc/blob/releases/gcc-16.2.0/COPYING.RUNTIME)；blob e1b3c69c179dfaff5744ea4bf853e6b0d90c9ef9 | 3324 | 9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74 |
| [同版本COPYING3](https://github.com/gcc-mirror/gcc/blob/releases/gcc-16.2.0/COPYING3)；blob 94a9ed024d3859793618152ea559a168bbcbb5e2 | 35147 | 8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903 |
| [固定SDK winpthreads/COPYING](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296/mingw-w64-libraries/winpthreads/COPYING)；blob 3507701238b798b1ddbf4d5ffe16f285f4458963 | 2883 | 63263614cdd29f2f93cba85e992f041b31f9fc7b4033692f31269489a8a1b177 |
| pixman-0.46.4/COPYING | 2087 | fac9270f0987b96ff4533fca3548c633e02083cbba4a0172a3b149b2e4019793 |
| [zlib v1.3.2 LICENSE](https://github.com/madler/zlib/blob/v1.3.2/LICENSE)；blob b7a69d058e616651eae27b3f90c0b7fd36c099b2 | 1002 | e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2 |

pixman文本来自[官方0.46.4归档](https://xorg.freedesktop.org/releases/individual/lib/pixman-0.46.4.tar.xz)，660536字节、SHA256 a098c33924754ad43f981b740f6d576c70f9ed1006e12221b1845431ebce1239，与上述固定包装配方的源pin一致；只读取指定COPYING成员，没有执行该源码。归档中137份C/H/汇编候选未检出GNU copyleft标记，这仍不能替代实际目标文件及逐文件权限核对。

## 例外条件与剩余闭包

GCC Runtime Library Exception 3.1是按带有相应声明的运行库文件适用的附加许可，涉及Independent Modules、Target Code与Eligible Compilation Process。已读取原文定义及附加授权；不能由包级标签推断整个GCC、全部SDK或任何IR处理插件均获豁免。当前配方显式使用GCC及普通C输入，没有配置外部IR优化插件；最终仍需结合实际编译/链接输入及分发对象核对条件，保留完整GPL3和例外文本。

原生16实际由libxcb-1.dll引入libgcc_s_seh-1.dll。另完整读取[GNU官方FAQ](https://www.gnu.org/licenses/gcc-exception-3.1-faq.html)（本次HTML快照25694字节、SHA256 ae403f4a3ec498c0243ee8644d323cee91a9243a9123043af145d84b472f3cb1）：静态、动态等组合方式适用相同例外条件；FAQ同时以独立分发libstdc++为例说明库本体仍需遵守GPL、对象代码分发需按§6供给源码。因此本候选仍须核对libgcc DLL自身的实际分发形式及对应源码/构建素材义务，不能由“独立模块程序可使用例外”推成“复制原运行库DLL无分发义务”，也不通过改变链接方式自动关单。

winpthreads的COPYING同时包含项目宽松声明和Lockless BSD三条款，二进制分发材料需落实后者的版权/条件/免责声明及无背书要求。pixman的COPYING列出多位版权方并要求保留声明；不能省成一个MIT标签。zlib要求真实来源、修改标识及源码分发notice保留，不能把构建适配冒充未修改原版。

原生17已读取最终XWin链接map，但在默认manifest对象的许可来源处失败，静态输入清单仍未完成；完整C输入和最终版本probe尚未执行。它们也不自动覆盖每个依赖DLL内部的静态链接、windres资源、字体/键盘数据或最终安装包。原生16安装的10个server文件包含独立xwinclip.exe及别名bin/X，当前PE递归入口仅为XWin.exe，不把所有安装文件自动纳入发行候选。

固定server的xkb/ddxLoad.c中RunXkbComp实际用Popen调用XkbBinDirectory下的xkbcomp，并按XkbBaseDirectory读取rules；xkbInit.c保留这两个运行目录。当前15库配方不构建xkbcomp，也不含完整xkeyboard-config数据，安装清单仅有share/X11/xkb/compiled/README.compiled。后续仍须补固定工具/数据来源、构建、许可、受管运行和真实键盘路径，不能用-version或本轮C编译成功推定桌面依赖齐全。

SDK逐文件例外、编译器运行库、生成器条件和缺少独立许可声明的图标/manifest/配置继续保留审查项。distributionApproved、bundled、desktopVerified均保持false；本记录不批准复制GNU编译器实现、发布引擎或关闭X0整体。

## default-manifest.o的固定源许可证据

原生17在最终链接map观察到/ucrt64/lib/default-manifest.o，owner为mingw-w64-ucrt-x86_64-windows-default-manifest 20260815-1。该包实际仅安装这一个对象，未安装notice；不能伪造licenseFiles或按整个SDK的标签推定权限。

已读取[固定配方](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-windows-default-manifest/PKGBUILD)（960字节、SHA256 c01b38f7f32970b42d2c9ab834d35eb69fb71a0f3de30a0340ce30e40cd203e8）、对应genrc.py（2567字节、SHA256 f2bfbcd92ab28d8671dda5a1485aae150ce5d5faf4395a6a4462cacd2a6fb60a）及[仓库LICENSE](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/LICENSE)/README声明。前两者git blob分别为bf3ae8fc26ba06fbc645a28fc3fd7102ee7e1f23、8235ee61487f144fe3a07bbbc03befb6138e1cc3；根LICENSE为e0f07ba679cbd516eb5feaff40e959f88f9a6ed1。源仓库BSD三条款全文1490字节、SHA256 e08ac31ef517ea449b7f402ab7940c750127c1de0566458d8e80635be9fa4055，逐字保留；二进制包的Public Domain声明单独记录，不将两层声明合并成批准结论。未复制或执行生成器实现。

[官方包页](https://packages.msys2.org/package/mingw-w64-ucrt-x86_64-windows-default-manifest)公布归档SHA256 b39039f754a600cc0dec49df7d675a59a3cb2b63691d91b4ae60735ee7075eca。实际下载的官方归档2652字节与该hash一致；唯一对象892字节、SHA256 9af5e18f01a63a7d02ba11e097324e046f778de5c74cd093b52296f8613dbcc8。其.BUILDINFO的配方hash与上述固定源文件相同，.PKGINFO为同一版本及Public Domain声明；归档分离签名未独立核验，明确保留该边界。

新核验器仅对这一固定package/version/declaration/完整单文件集合及对象hash使用独立sourceLicenseEvidence；再校验源许可资产字节，保留installedLicenseTextPresent=false与空licenseFiles。版本、对象、额外文件或许可文本漂移继续失败，其他缺notice包仍失败。这是已审查源证据的采集，不是许可证采用批准。后续原生仍须验证，原生17失败不改写为成功。

原生18（code60ac904）已在真实SDK逐项通过该核验，源manifest SHA256 c7bb6cc0bfbea5fd197f6ab3c34c3c1208c4fcadf00bc9432b73f0334c810cc9，包仍无已安装notice。完整map后续在链接器内存BFD对象处FAIL，不改写为整条核验通过。其CRT包的COPYING实际hash已匹配上游固定SDK根COPYING：2326字节、SHA256 99a69660981156c21336fdb5661f89341b013c94e4bf9e1c7467b4745718397f；gcc与开发winpthreads包的对应文本也与已列原文一致，CRT其余两份细分notice仍须逐项核对。

## 链接器生成输入的权限边界

GNU ld创建的rtr/ertr与dll stuff是内存BFD对象。生成器身份记录到build-tool scope，不把GNU链接器加入运行时发行候选，不复制其实现或将其许可证直接标给输出。新的最终PE贡献字节核对只建立来源与内容证据，输出采用仍未批准；未知文件不能由命名模式获得豁免。固定源hash、生成类型与反例见[原生18记录](windows-build-evidence.md)。

## CRT三份实际notice与固定原文匹配

固定[CRT配方](https://github.com/msys2/MINGW-packages/blob/fb1bee30b4f11cf4b857197a288466afad49033a/mingw-w64-crt/PKGBUILD)git blob b60924373c6fb91141c2a0517bd9c570dc1e766a明确使用SDK commit63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296，并安装根COPYING及两份细分notice。现完整读取后两份原文，按blob字节校验git SHA1，SHA256分别匹配原生18/21的实际CRT许可记录：

| 原文路径 | 字节 | SHA256 / git blob |
| --- | --- | --- |
| COPYING.MinGW-w64/COPYING.MinGW-w64.txt | 5905 | f38e6194bd3bfa1b654f118e5acefe0aead437bbe669eee43957ccc65a7127f1 / decbf46bde9d87a0c2250fe33ece1b7e0724ee6e |
| COPYING.MinGW-w64-runtime/COPYING.MinGW-w64-runtime.txt | 12155 | 1db8da07b436c68833c0673ffee3d9fcb2526047f3820b81661865dfedc79a1f / 776d5f1034240f6dae0ce59d592f9c6f4ad29e7d |

三份CRT安装notice至此均已同固定源文本匹配。非runtime文档明确区分GNU工具/可选profiling代码与普通应用输出；runtime文本包含MinGW总体、getopt、gdtoa、Sun数学函数及musl的不同保留声明，也保留Cephes权限措辞未定及Wine导入头/IDL的LGPL事项。不能把crt包级ZPL标签概括为全部文件。当前map记录的是实际加载的完整archive，不是其中最终选中成员的逐项权利清单；Cephes/profiling/Wine是否进入输出仍须结合真实成员、编译输入和对应声明核对，未由notice匹配推定不存在或批准发行。

原生21已核对105项最终XWin链接输入（含3份内存生成输入），链接器程序hash与固定官方发布包一致；构建工具许可和输出采用仍分开记录。每个依赖DLL内部的静态/资源、完整SDK逐文件及打包notice落实仍开放。
