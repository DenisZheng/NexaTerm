# Windows X server 工具链运行库许可实证

状态：审查进行中，未批准随包/分发。当前基准code4108212/原生22，覆盖实际递归PE集合的四个目标工具链DLL及已经观察的SDK/编译与链接输入；固定X库、生成器、资源及其他编译/静态输入见[构建证据](windows-build-evidence.md)。不把整个私有prefix或编译器包当作发行清单。

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

## 固定SDK源码身份与CRT发布对象交叉核对

继续读取同一SDK commit63ebe6cdb3ec4d5c586b7f0f0c03dd502e44c296的官方GitHub归档（15827606字节、实际SHA256 94469ea48f974f9a4f7d8b7050cb7eceaa92c1f941ed3b6b8137591ba19491de）。对headers/include、crt、ddk三个tree及CRT源码tree重建Git tree对象hash，再按blob原始字节逐一核对归档：headers共2064文件，CRT共4335文件；对应tree分别为a24dd082c55841bec4437ac9c15f145577eb340b、05b4b86044cfcfec6729efc001f6da909d919d6e、a913de235999def84a08413d884d56fe41fea1dc、829f684f31c5b92c2ade2d339f52acd9004d0db9。没有复制SDK实现进项目。该身份清单用于随后同真实compilerInputs逐项匹配；不将“没有行内许可标记”当作权利批准，WIDL生成头还须追到输入IDL及适用根声明。

标记核查已处理C注释行首星号及换行：headers候选中303文件存在GNU许可证文字；CRT的9个文字命中文件均非C/H/汇编实现。具体DirectDraw/propkey原文确为LGPL，继续排除。重新核对15个固定库的843份候选仍无GNU标记；server的1145份候选仅winprefsyacc.c/h命中，完整保留Bison3.8.2附加例外。以上只是固定文本的定位与身份核对，不能代替逐文件权限和实际编译/链接相关性审查。

另独立下载[官方CRT发布包](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-crt)，4067902字节、SHA256 5975fa56060f1d428d2369b6be70b1e63c0512c63031c2bae722b45610d1c1ea，与官方包页一致。原生21实际14项CRT链接输入（13个archive及crt2.o）逐个匹配包内字节；新成员读取器已成功解析这些真实GNU/COFF archive，包括名称表及全部成员边界。包的分离签名仍未独立核验；原生报告cachedArchives为空的事实保留，本次独立下载不会伪造其cache内容。实际选择哪些成员由下一次map取证确认。

## 原生22的333份实际工具链C输入：源码与生成差异

333份输入均已定位到以下固定来源或精确生成差异，仍为来源核对，不标记perFileLicenseReviewComplete。

| 实际provider | 份数 | 已核对身份 |
| --- | --- | --- |
| SDK headers14.0.0.r495.g63ebe6cdb-1 | 202 | 201份与固定Git源码逐字节一致；_mingw.h.in只按官方配方的DEFAULT_MSVCRT_VERSION=0xE00、DEFAULT_WIN32_WINNT=0xA00替换，输出20097字节/hash f1f6ed2fe17776624707d197905c6bb29881c5dfb8c2f5489b67592a16e0d466，与实际输入一致 |
| GCC16.2.0-6 | 121 | 固定上游release commit78d4ac73dd391005b895a6148cd9831e28e1208b：116份直接匹配；gmm_malloc.h按同字节安装为mm_malloc.h；float.h后置、stdarg.h/stddef.h前置同名include_next；limits.h由limitx.h/glimits.h/limity.h拼接，所有实际输出hash匹配。官方Makefile.in的USER_H_INC_NEXT_PRE/POST规则已读取核对 |
| winpthreads固定SDK commit | 6 | pthread.h/compat/signal/time/unistd及sched.h与固定winpthreads/include原文一致 |
| pixman0.46.4-3 | 2 | pixman.h原文一致；pixman-version.h.in按0/46/4替换后的1786字节/hash eebbff4b66cbcc98b3ffa16c68a919d4a16dfcffb86cd1fb85faea4f07bcd76b与实际一致 |
| zlib1.3.2-2 | 2 | zlib.h原文一致；zconf.h保留两个configure检测结果和固定largefile patch（SHA256 8e1cdf8edfc6ac08b0e660ca42a977942a88fab3ff59c01c87ba96500e2c3e63），四处精确变换复现16970字节/hash 6f3a8f18eaa62f482d00e4d5b083afe4bbe4ace0864d2b88a78e262680788183 |

GCC的119份输入对应带GPL3及Runtime Library Exception3.1声明的源内容；另两份stdint-wrap.h和gsyslimits.h为不带独立许可文字的短include wrapper，不能自行改标Public Domain。实际SDK stdarg.h则是GPLv2+与原文件独立的GCC header inclusion exception，不是RLE3.1；已完整读取，当前profile实际使用GCC，仍保留例外原文及“不排除其他GPL原因”的边界。源header权限不自动解决运行库DLL本体、其他输入或最终包的义务。

22份实际SDK WIDL生成头继续追到23份可达IDL，路径均存在且有固定源身份。exdisp.idl、objectarray.idl、msxml.idl带LGPL声明，生成header中缺少该段文字不能抹掉来源；需结合实际结构/宏/inline使用、最终贡献及适用条件继续审查。此项不能由“202份头字节已匹配”关单，也没有把这些实现复制到项目。

## 四个实际工具链DLL的官方发布包payload核对

已分别独立下载下列官方UCRT64归档，先匹配包页公布SHA256，再读取实际DLL及所有已采集notice，逐项匹配原生22。没有将安装包名/owner当作二进制字节证明。

| 包/版本 | 归档字节 | 公布且实际匹配的SHA256 |
| --- | --- | --- |
| libgcc16.2.0-6 | 77191 | 80b2497f019977dd9528b1abc8621b1328a0115ab1f724047ccbb56bf323f11d |
| pixman0.46.4-3 | 356199 | 4c01b986563d2b5f7ad6fcec2d0ec9915d2f242ddac5eacddc19971964241cc5 |
| libwinpthread14.0.0.r495.g63ebe6cdb-1 | 32075 | 1f847f4f5d56d8f54cbc9b5ce339c36f4f208353e813d4b1e5648cf33138b9a2 |
| zlib1.3.2-2 | 111475 | 841401182976d2f9e17e5c0ebaac51f2a8014140ea53d67625e91c8fb3c85ea0 |

分离签名仍未独立核验，原报告cachedArchives为空仍如实保留。payload/notice一致性不代替GCC库本体的源码/构建素材安排、逐文件权利或分发批准。

下一步按实际范围继续：先用成员证据核对XWin选中的CRT/GCC与源文件及对应声明，再单独补依赖DLL内部静态/资源。SDK生成头的IDL、GCC与SDK两类不同例外和无独立声明wrapper分别审查；完整保留来源与notice条件。xkbcomp及XKB数据尚未进入当前15库构建，不用本轮版本probe代替这些运行依赖。
