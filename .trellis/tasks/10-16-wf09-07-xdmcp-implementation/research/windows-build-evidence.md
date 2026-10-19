# X0 Windows原生构建与依赖/许可证据（2026-10-19）

本刀沿Draft #84固定输入继续，不重做源码采集入口。Draft #85堆叠#84，仍为开发构建；发行批准、bundled、desktop均false。15个依赖官方归档及51项许可文件hash见`scripts/xserver/windows-sources.json`。这些锚点证明核查了哪些文本，不是整个编译/运行闭包的MIT结论。

## 当前继续入口

先核对[Draft #85](https://github.com/DenisZheng/NexaTerm/pull/85)最新HEAD和原生workflow，不把历史失败当作最新结果。code872dac6的source CI16及完整应用CI683七执行job均成功（条件打包为既有skip）。原生13的47项反例、全部15依赖构建安装、IPv6/AppID/font二进制I/O实际探针及引擎XDMCP/Winsock/relocate配置均通过；完整server make随后在LLP64地址/标量桥、SDK命名空间、缺失winauth.h及Unix测试程序处FAIL。继续实际引擎编译和PE/运行库/编译输入许可闭包，不能标记native build完成。原生13 artifact12171955533已实际下载：仅一JSON，SHA256 ba5f7a5f0a6318e983e5f9a01c384897bdabfedc33f847a9979272afc23cc406。source16 artifact12169904620也核对仅两JSON，SHA256 625d0aa17bab970c866d7309e6975e31e7c3b0c1a24de963064743e1544ab1b0，15项与code872dac6清单一致；所有分发/随包/桌面标志仍false。

## 首次真实Windows构建

代码`d86be6bb6968ce0468d8557b48094614008072af`，[原生构建1](https://github.com/DenisZheng/NexaTerm/actions/runs/39186069194)。Windows UCRT64环境安装成功，真实server归档/GPG核验通过，MinGW目标工具链已读取；util-macros configure/make/install通过。xorgproto configure通过，但make试图调用不存在的aclocal-1.19而失败，整次保持FAIL，不宣称原生server构建成功。

根因在本刀自写解包器：写文件后保留了mode但没有保留发行归档mtime，导致Make误判Autotools生成文件过期。修正为保留已固定归档的原始文件时间戳，并在解包测试中断言精确mtime；没有忽略Make失败、禁用规则或伪造生成结果。同时补充实际解压预算（含tar元数据/填充）及官方重定向检查。

## 第二轮真实构建

代码`f1f4dbac6006e9f2faccde7a359dbc9ac67ea918`，[原生构建2](https://github.com/DenisZheng/NexaTerm/actions/runs/39186451144)。时间戳修正生效，xorgproto、xtrans、libXau、libXdmcp、pthread-stubs、xcb-proto均完成构建/安装。libxcb configure通过，生成C源码时找不到私有prefix中的xcbgen；保持FAIL。

宿主MSYS Python的模块路径与目标native pkg-config的Windows路径改写需要分开。修正为显式设定已安装的固定xcb-proto模块目录并验证实际import文件；没有跳过生成器或换用系统未知版本。同时按实际Autotools Makefile将预期程序名固定为XWin.exe（此前Xming名来自Meson分支），新增普通/延迟PE导入解析、实际安装文件owner及链接map/运行库许可来源检查。本地两类source/build/PE/inventory共47项通过，无skip；原生构建结果待续。

## 第三轮生成器probe修正

代码`df498fed9b3496007698a85ca8197ce17f5b342c`，[原生构建3](https://github.com/DenisZheng/NexaTerm/actions/runs/39187208563)。私有xcbgen路径已找到，但本刀路径probe直接导入state，触发其对真正generator的`__main__.output`要求而失败。这是probe未遵循上游模块契约，不是XCB编译结论。改为导入无该副作用的xcbgen包本身，验证实际路径及文件与固定源码逐字节一致；新增带有“必须有generator上下文”子模块的真实子进程回归，不伪造output对象。

本地包管理器因命名空间setgroups/setuid权限未能安装交叉工具链，不把本地环境当作Windows编译证据。真实构建在Windows runner执行；没有更改系统提权策略或产品能力。

## 第四轮：固定libxcb的Winsock参数类型

代码`bb89f459f4adab65b23b21781cfb888ecb1514fa`，[原生构建4](https://github.com/DenisZheng/NexaTerm/actions/runs/39187786461)。私有宿主generator已真实生成libxcb C代码，编译在`src/xcb_util.c`的两处setsockopt调用失败：MinGW Winsock声明要求const char指针，上游传入int指针。保持FAIL，不视作原生server成功。按原始文件MIT许可保留全部头部，开发构建仅对两处参数增加const char缓冲区转换，整数值和sizeof不变；在manifest固定修改前后文件SHA256，任何来源漂移先失败。没有降低警告级别或绕过编译器。

## 15项依赖分离签名与证书

固定15个官方归档的签名原始字节、完整签署者与主钥指纹，公钥证书仅存公共部分。集成入口`xserver_windows_signatures.py`在本地真实GPG离线执行15项全通过；Windows构建逐项在解包/执行前验证，独立source workflow也实际在线验证。密码学一致性不是维护者身份或发行批准。

Alan Coopersmith证书的RSA签署子钥与DSA1024主钥分别记录；完整公开证书来自manifest所列Ubuntu公钥服务，不能用缺失身份绑定的过滤证书伪造验证。Matt Turner证书含旧的过期/撤销子钥，gpgv会为旧子钥产生KEYEXPIRED提示；当前主钥和实际Ed25519签署子钥仍在有效期。核验器明确检查当前两钥，并只接受绑定到其他证书子钥到期时间的提示；EXPKEYSIG、REVKEYSIG、未知状态继续失败。libXfont2仍使用DSA1024/SHA1，与server一样保留旧算法审查。没有弱算法强制开关、伪造时间、信任覆盖或密钥服务器自动刷新。

## 许可/资源审查边界

- 15个依赖的51项固定许可文本均已实际读取；其中xorgproto含37份细分许可。根许可文本未见GNU copyleft段落，不据此豁免各编译单元、生成器或运行库。
- server的`winprefsyacc.c`是带Bison特殊例外的生成输出；必须保留具体来源/hash/例外条件审查，不能把其GPL标记忽略或笼统覆盖整个server。
- server本地`ddraw.h`在MinGW-w64路径转向工具链`include_next`；实际包含/运行闭包以原生构建和工具链文件核对，不能仅按该文件未展开的兼容定义给整包许可定性。
- 已固定13个具体server文件的hash与逐项审查说明。winprefslex.c实际标记Flex 2.6.4，grammar的许可声明位于字节24230；[上游固定tag的COPYING](https://github.com/westes/flex/blob/v2.6.4/COPYING)原文另存为许可证据，含对生成scanner/skeleton的明确说明。Bison 3.8.2生成文件中的例外完整存在，[GNU条件说明](https://www.gnu.org/software/bison/manual/html_node/Conditions.html)与该例外用途相符；这不批准把生成器或GPL skeleton实现复制进项目。
- winmsg.c只在CYGDEBUG下引入无独立许可声明的winmessages.h。构建profile显式关闭debug，并要求实际Automake编译依赖中该表缺席、DirectDraw SDK头实际出现及有工具链owner；观察缺失即失败，不仅按configure推断。该检查仍不等于所有传递库逐编译单元审查完毕。
- GLX/DRI及非目标服务器关闭，XDMCP显式开启；该2D开发profile不构成完整桌面扩展/打包能力承诺。

后续继续实际构建、原生probe、PE及递归DLL来源、逐文件/编译器运行库和资源义务。当前未取得全部证据，不归档整体任务。

## 第五/六轮：libX11 LLP64与GPG状态差异

[原生5](https://github.com/DenisZheng/NexaTerm/actions/runs/39188536857)（code986da69）及[原生6](https://github.com/DenisZheng/NexaTerm/actions/runs/39189475179)（code20e657b）均已完成libxcb及三个xcb-util库的编译/安装，进入libX11后在XIMStyle由指针直接转换时失败。Windows LLP64的long/XID类宽度与指针不同；自写固定补丁仅在已核对的标量varargs/资源ID转换中使用intptr_t/uintptr_t中间层，保留公开标量宽度、负数符号扩展及原始许可声明。没有关闭国际化或pointer诊断。

code20e657b的[完整应用CI676](https://github.com/DenisZheng/NexaTerm/actions/runs/39189475221)全部执行job成功；[source CI9](https://github.com/DenisZheng/NexaTerm/actions/runs/39189475197)的原server输入核验和全部单测通过，但独立15项依赖入口拒绝未知GPG状态，仍为FAIL。补充失败报告中的受限状态名称和当前component/部分已完成证据，先查明具体差异再决定处理，不增加未知状态通配。独立下载逻辑提取为sources模块，消除核验入口与构建入口的循环依赖。

## GnuPG 2.2元数据兼容（2026-10-19下午续作）

codea82652e的[source CI10](https://github.com/DenisZheng/NexaTerm/actions/runs/39208160658)将未知状态精确定位为VERIFICATION_COMPLIANCE_MODE。核对[GnuPG 2.2.27官方DETAILS](https://github.com/gpg/gnupg/blob/gnupg-2.2.27/doc/DETAILS)（blob a02ba35979afc68d50e2373ebeb7801c894af874）：该状态报告数值compliance flags，当前定义8与23。只接受非空、不重复的这两个已知值并原样留证；缺少GOODSIG/VALIDSIG、坏签名、错误身份/算法/有效期或未知flag继续失败，新增独立反例。此兼容没有批准发行或豁免旧算法。

## DirectDraw SDK许可实证与GDI收窄

原生6工具链实际安装`mingw-w64-ucrt-x86_64-headers-14.0.0.r495.g63ebe6cdb-1`。核对[该源码提交的ddraw.h](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb/mingw-w64-headers/include/ddraw.h)（blob aa71819423d2f40f748a73cd9b55e77e47926be5），其文件头明确为LGPL-2.1-or-later。因此“已转到SDK”不能关闭许可问题；此前SDK必须出现的检查已被本节的新profile替代。

开发profile收窄为现有GDI：自写小型选择器保留原许可声明，调用原GDI资源回调，拒绝其他显式engine选择，并传播回调失败；删除DirectDraw探测/动态loader入口、专用结构字段、后端编译对象及dxguid链接库。按原始/结果hash固定6项server适配，Makefile.am/in同时维护且不重生成Autotools。编译依赖必须证明GDI实际编译、DirectDraw头/后端及无许可调试表缺席；链接map也拒绝DirectDraw对象/归档。真实C编译执行同一选择器，覆盖不支持engine、未初始化能力及回调失败。原生Windows完整构建仍是独立必需证据，GDI改动不等于桌面互通或发行批准。

code3ac679a的[source CI11](https://github.com/DenisZheng/NexaTerm/actions/runs/39208343422)已全通过；实际下载并核对其仅两个JSON的artifact（归档SHA256 53c383124ad42923a31e6179f9369b04f94a6e5466d0a005e874e15ba48a7c55）：15项组件pin与本地manifest一致，报告REVIEW-REQUIRED、distributionApproved=false，compliance元数据为无或23。旧主钥算法9项、旧摘要1项仍明确记录。

## 原生8继续推进XIM编译

[原生8](https://github.com/DenisZheng/NexaTerm/actions/runs/39208343489)（code3ac679a）确认最初imDefIc标量转换错误已越过；随后imRm暴露三处把Windows指针NULL转Window整数及另一处XIMStyle标量入口。前者改为X11的数值None，后者纳入同一uintptr_t桥；保留全部编译诊断与精确发生次数/hash。此次仍为FAIL，尚未产出server原生成功证据。

## 原生9：XIM转换已越过，修正Winsock IPv6声明

[原生9](https://github.com/DenisZheng/NexaTerm/actions/runs/39209753199)（code4010ff0）已通过全部43项Windows证据测试和真实GDI C选择器，XIM标量/None错误已越过；libX11随后在编译Xtrans的xim_trans时缺socklen_t/addrinfo/IPv6及地址转换声明而失败。固定xorgproto的Xwinsock包装头在原有namespace保护内包含ws2tcpip.h，保留前后hash和Open Group许可；在安装该头后立即编译并执行数值IPv6回环探针，覆盖真实WSAStartup/inet_pton/inet_ntop/getaddrinfo/freeaddrinfo/WSACleanup，不建立连接。

编译阶段改为GNU make -k，收集同一组件的独立错误；make非零仍立即使整个构建FAIL，失败组件不会进入install。没有关闭诊断或把错误改为成功。

## 原生10：探针宏的命名空间修正

[原生10](https://github.com/DenisZheng/NexaTerm/actions/runs/39211597892)（codee0f47aa）在安装已修正Xwinsock头后提前执行原生IPv6探针。旧socklen_t/addrinfo/转换函数声明错误未再出现；探针自己的MAKEWORD宏展开引用了已被X11包装头恢复/重命名的BYTE，编译失败。改为等价且明确的Winsock 2.2 WORD值0x0202，继续真实编译/执行；不把这次探针错误当作引擎不支持IPv6的结论。source CI13已成功，完整原生引擎仍未验证完成。

新增IPv6头亦逐文件核对：[同一SDK源码提交的ws2tcpip.h](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb/mingw-w64-headers/include/ws2tcpip.h)（blob75ff1fc006e12360f05021509b435bed9691fa01）明确声明Public Domain并指向DISCLAIMER.PD。此处记录具体文件级证据；最终分发仍需结合实际SDK文件/包owner及整体义务，不按SDK统一标签批准。


## 原生11：IPv6与libX11通过，隔离客户端/服务端geometry头

[原生11](https://github.com/DenisZheng/NexaTerm/actions/runs/39212134719)（code69a1467）实际编译并执行数值IPv6探针成功；libX11的完整make及make install也成功，未关闭国际化或编译诊断。安装owner检查随后发现xorgproto的legacy XKBgeom.h与libX11公共客户端同名头内容不同，按设计拒绝覆盖；不是新的C编译错误。

固定官方源中，xorgproto版本15808字节、SHA256 84413c7719ed49453cb543454fa84a48dceefb866790e48c871b43cbff16d089，含XKB_IN_SERVER的SrvXkb别名与服务端geometry声明；libX11版本13758字节、SHA256 420d8335306aad84fde239eba310e7da5ffaecb572111ce78e42736fba77828f，是客户端API。不能把其中一个全局覆盖另一个。xorgproto关闭legacy公共安装，让libX11拥有公共客户端头并验证安装后原始字节；服务端头从已核验xorgproto源完整复制到私有server include上下文，保留原许可并校验复制前后hash。后续真实服务端编译依赖必须观察到该私有头，公共客户端头不能替代这项证据。

覆盖检查继续FAIL，并把原owner及覆盖前后hash/size写入失败JSON，未引入覆盖白名单。本地67项回归无skip，包括真实GDI C选择器、冲突诊断和两种头上下文隔离；完整原生构建继续验证。source14与应用CI681通过的代码对象为69a1467，后续改动不能继承为已验证。


## SDK属性表与生成头/资源逐文件补充

沿实际propertystore.h包含链核对[固定SDK提交的propkey.h](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb/mingw-w64-headers/include/propkey.h)（blob729a0bda2364fc92337b18ced095d63326ad7165），该文件也明确为LGPL-2.1-or-later。不能沿用“SDK统一宽松”的推断。上游propertystore.h本身有完整宽松许可，非MinGW分支已含单个PKEY_AppUserModel_ID声明；仅把这项原有声明移到共同分支并移除propkey.h，继续使用真实IPropertyStore接口，保留任务栏AppID功能。该键的GUID/PID已与[Microsoft System.AppUserModel.ID](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-id)独立核对；没有从LGPL属性表复制实现。

propsys.h由WIDL生成（blobc8764f4f3e77adecff4731dc2b477cc9308ed500），IDL原始输入另核对blob650f636226c3ec89d2e3d13fe870a99b28a0fcad。[同一提交根COPYING](https://github.com/mingw-w64/mingw-w64/blob/63ebe6cdb/COPYING)（blob28fa9514c036c2ae6a545fc9fe75c37baecf596d）明确默认ZPL-2.1，PD/BSD/LGPL标记的部分分别例外；该规则支持无独立标记文件的默认许可归属，但不覆盖有例外声明的导入头。继续核对实际编译依赖及生成/导入声明来源，不能把整个SDK贴上统一MIT标签。propkeydef.h（blob3b7750294232ce0625883094d9624eed693e9f39）实际声明Public Domain并指向DISCLAIMER.PD。

新增原生AppID头探针，通过真实SDK IPropertyStore的SetValue函数表调用核对同一键及字符串值；源码GPG/hash核验后、全部依赖编译前先执行，使接口问题提前失败。这是声明/ABI探针，不是实际Windows shell桌面验收。完整服务端编译依赖必须观察到winSetAppUserModelID.c且所有记录均无propkey.h；缺观察或传递包含仍FAIL。

补齐winprefsyacc.h的Bison 3.8.2完整例外、propertystore.h及XWin.rc/XWin.exe.manifest/X.ico/system.XWinrc原始hash/size，server逐文件锚点增至19。资源脚本有宽松许可不自动批准嵌入图标；图标、manifest及示例配置的独立分发来源未关闭，继续作为明确采用缺口。全部7项固定server适配已在真实归档逐字节应用校验，本地68项回归无skip；后续新增代码仍需重新执行Windows及完整应用CI。


## 原生12：前14依赖通过，修正font buffer文件描述符桥

[原生12](https://github.com/DenisZheng/NexaTerm/actions/runs/39215982466)（code2d0b9a0）确认xorgproto不再安装legacy公共geometry头，libX11拥有正确客户端头；libxkbfile的真实Meson构建安装及libfontenc也完成。最后libXfont2的bufio.c仍把文件描述符通过LLP64 long在指针间编码/解码，GNU make -k收集到同一宏和两个入口的全部宽度诊断，整次FAIL。

仅把有符号CRT文件描述符与既有opaque private字段之间的long桥换为intptr_t，并显式包含stdint.h；不改变字段/API宽度、I/O、缓冲或close语义，保留Open Group许可并固定原始/结果hash与两处入口发生次数。新增真实target archive的二进制写入/flush/read/EOF探针，覆盖CRLF、0x1a、NUL与0xff及临时文件清理；不把编译成功替代实际回调执行。

code2d0b9a0完整CI682：Rust Linux617/4既有ignored、macOS618、Windows620，二进制各19、集成各1均通过；前端1160/1todo、脚本193/3既有环境skip、安全18/0skip，七实际执行job全部成功。source CI15为21源码+46 Windows证据回归及真实15依赖签名通过。新增属性表/font补丁和探针为后续代码，须重新取得原生和完整CI；本地68项无skip，不借用旧CI结论。


## 实际编译输入的来源清单

仅有包级许可或少数renderer依赖不足以核对所有C编译输入。下一轮为目标库及server保留Automake依赖跟踪，对libxkbfile读取实际Ninja节点；固定的header/host-generator-only组件另标范围，不伪造C编译记录。保留依赖记录hash、每个实际文件的hash/size、来源组件或pacman实际owner以及使用它的组件；安装头不能凭目录猜owner，私有geometry头还必须符合具体manifest pin。未知根在读取文件内容前失败。

解析器处理原生盘符、转义空格/井号、续行、phony目标及nonrecursive Makefile工作目录；已知bootstrap注释不计为编译观察，缺观察仍FAIL。Ninja节点要求VALID且依赖数精确一致；[固定工具版本1.13.2实现](https://github.com/ninja-build/ninja/blob/v1.13.2/src/ninja.cc)（blob92d0761aa38e5b866dc1118f62c3974539665b44）已核对格式及工具模式不输出Entering directory。SDK文件只查询一次实际包owner，再从该包完整文件清单绑定其余文件，附实际许可文本与包版本/归档hash，不按目录统一定性。

范围明确为实际观察到的C构建输入（也包含本次构建的开发用target utilities），不从“编译过”推断“随包分发”，也不覆盖windres资源或宣布逐文件许可审查全部完成。DirectDraw与propkey已知排除项在整个观察集合继续拒绝。新增真实GCC测试实际生成含空格/井号文件名的依赖记录，不仅依靠手写fixture；失败保留先前已完成组件的实际输入记录，并标明当前失败组件；不会用旧报告补成功。本地80项无skip。该新清单仍需下一轮Windows执行验证，不借用code872dac6的结果。


## 原生13：全部15依赖及实际探针通过，进入完整server编译

[原生13](https://github.com/DenisZheng/NexaTerm/actions/runs/39218312478)（code872dac6）确认libXfont2 intptr_t适配、真实目标archive的二进制write/flush/read/EOF与清理均成功；早期AppID接口与IPv6探针也成功。完整server configure已实证XDMCP/HAS_WINSOCK/RELOCATE_PROJECTROOT启用、debug关闭。随后make -k收集179条诊断，来自有限根因，不按条数视为独立任务或工时：

- core的32位long承担地址对齐或opaque标量桥。地址运算改为uintptr_t保持完整地址，负的共享pixmap句柄/iterator用intptr_t保持符号；public XID/标量宽度不变，诊断指针改用%p，不关闭警告。misc.h原本已包含stdint.h。
- XCB-first头链直接解析原生Winsock导致BOOL/INT32与X11冲突；晚解析COM又遇到Status及原生INT64/LONG64。固定profile让XCB使用已拥有的xorgproto保护包装头，先在一致命名空间加载Windows/COM，再恢复X11类型。保留调用方WIN32_LEAN_AND_MEAN，排除Winsock1；将propertystore已有宽松许可IID及单个PKEY声明共享，不链接整张LGPL属性表。新增实际XCB-first静态类型/执行探针，AppID探针改为真实Xproto/Xwindows上下文，在xorgproto安装后、重库编译前运行。
- 固定归档确实没有winauth.h，仅补本来winauth.c实现的两个函数声明，create必须显式、目标必须不存在且overlay字节精确固定；不替换认证、cookie或安全实现。
- 既有select fallback的pollfd与SDK WSAPoll结构tag冲突。先加载受保护Winsock，再将server私有结构名/既有事件位隔离；不把私有int fd结构当作SDK SOCKET结构。新增实际os archive的单个UDP回环就绪/非阻塞超时探针，使用真实socket前验证其值可由既有int fd表示，不声称所有Windows句柄均可截断。
- 上游test/tests和simple-xinit均依赖sys/wait/fork，当前profile使用官方--disable-unit-tests排除这两个Unix测试可执行文件，明确不记为通过。项目三平台完整CI、Python反例及真实Windows目标探针保留；没有禁用国际化、运行时、编译诊断或把失败改绿。

本地81项无skip；固定源码全部组件适配及21项server适配（含一个缺失声明文件的显式创建）均已实际逐字节核验。后续实际Windows仍须验证，不继承code872dac6结果。完整编译输入清单为新代码，亦待同次真实执行。

## 原生14：修正INITGUID后的属性键定义宏

[原生14](https://github.com/DenisZheng/NexaTerm/actions/runs/39222995223)（code41b1965）已通过受保护Windows/COM头链的实际IPv6编译/执行；真实Xproto/Xwindows上下文的AppID探针也已越过类型编译错误，但链接缺少PKEY_AppUserModel_ID，整次仍为FAIL。早期加载propsys.h时，propkeydef.h已经将DEFINE_PROPERTYKEY设为extern；后来initguid.h只刷新DEFINE_GUID，不能令此前的属性键宏自动变为定义。

已核对的Public Domain propkeydef.h没有header guard，按当前INITGUID重新定义DEFINE_PROPERTYKEY。仅在propertystore.h的propsys.h之后显式再次包含该SDK头，遵循其既有宏契约；保留原有单键声明、真实接口与排除LGPL属性表的要求，不复制SDK宏实现或靠额外库掩盖缺定义。固定补丁结果hash随实际字节更新，本地81项回归无skip。新代码仍须取得实际Windows结果。

code41b1965的[source CI17](https://github.com/DenisZheng/NexaTerm/actions/runs/39222995201)及[完整应用CI684](https://github.com/DenisZheng/NexaTerm/actions/runs/39222995202)均成功，后者七个实际执行job全通过；这些结果不包含本节后续链接修正，也不将原生14失败覆盖为成功。

## 原生15：AppID实际通过，修正libxcb的Winsock版本宏

[原生15](https://github.com/DenisZheng/NexaTerm/actions/runs/39254455753)（code09faad9）确认真实Xproto/Xwindows上下文的AppID探针已编译、链接并执行成功；对应属性头SHA256为363f0c25ee9af00da4ef6932d864129fd14fe6f7296541aa4bc09e315f66537d。IPv6也通过。libxcb随后仅在WSAStartup的MAKEWORD(2, 2)失败：宏于X11恢复namespace后展开，原生BYTE名已不可见。仅把该固定版本请求改为同值的(WORD)0x0202，保留错误返回与WSACleanup语义，不恢复全局BYTE别名或关闭诊断。Xtrans同类调用原本具有Xmd的CARD8 BYTE声明，不据此扩展改动。

原生15仍为FAIL；实际下载检查单JSON artifact，ZIP112217字节、SHA256 775b8c0a69e539438ca6b2a42f2821a3da35a7b108ce638d403530730f782056，七个前置组件已built，所有采用/随包/桌面标记仍false。[source CI18](https://github.com/DenisZheng/NexaTerm/actions/runs/39254455746)的21+60项回归及全部15签名通过；两JSON归档85274字节、SHA256 66e47e039c5319a1ff3558d8196d253df8263886dca07e7936ddd092adbf0f2e，manifest及全部源码/签名pin已逐项匹配。新版本宏修正不继承这些旧代码结果。

## 内嵌字体的数据级许可核对

固定libXfont2归档的src/builtins/fonts.c为82957字节、SHA256 db6746ae498e77d57647fb803b3c895cfc5745801864d1b5ed992ce28b83eccd，含SuSE完整宽松许可。另按C八进制字节字面量读取两个数组，限额解gzip并读取真实PCF属性，避免只按生成C文件头推定字体数据权限：cursor的COPYRIGHT为`These "glyphs" are unencumbered`，6x13为`Public domain font.  Share and enjoy.`。前者gzip5105字节/hash ad32fe68634080cd494758bee0026f7a940bce0bbd2a1d9bddac7578e319c519，PCF14208字节/hash 1f853aba64596f1acb8e48750aff11ed139d93423baf9a172ffc654f22cd7494；后者gzip4385字节/hash 7734d9d7ba75f1c0dea76aaf4782ffd86b8aef7f00a1cb3c0ef127586e27fa9c，PCF19584字节/hash 6f1bc71fb2fd55b70b07a6d59df6ee5a2bb8bd3e052b6f08925db54fed65b339。此为固定profile的内嵌资源来源核对，实际编译/链接相关性和最终分发义务仍须结合原生清单，不批准外部字体或整体组件采用。

## select fallback的独立BSD许可

固定server归档的os/xserver_poll.c为8662字节、SHA256 cbbac20292c46e1cae52deb89bb0b489eb961d49c19e2e02c63167d5e85b2350。实际文件明确为Brian M. Clapper 1995–2011的BSD三条款：源码保留版权/条件/免责声明，二进制分发材料也须复制这些内容，并限制以版权方或贡献者名义背书。此项不能合并成统一MIT标签；保留精确文件身份与原声明，后续结合真实os archive/链接输入和分发notice落实。本轮仅隔离私有pollfd与SDK WSAPoll的声明，未替换这份fallback实现或抹掉其条款。

## 固定依赖归档的候选源码标记核查

code6e1f8fd对应的15个归档均再次先匹配manifest大小/SHA256，再逐文件读取C/H/L/Y/S/inc及C/H模板候选，合计843份：xorgproto156、xtrans7、libXau11、libXdmcp13、libxcb16、xcb-util8、image10、wm3、libX11 504、libxkbfile20、libfontenc7、libXfont2 88；其余三个header/host-only归档没有这类候选。未发现GNU General/Lesser/Library/Affero Public License或GPL系SPDX标记。

该结果仅记录固定归档中这些候选文本的标记检索，不是逐文件权限批准，也不是实际编译/链接清单。尚未包含libxcb等构建生成输出、Python/XML生成器输入、SDK/编译器文件及资源；这些仍须结合实际依赖记录、源许可和生成器条件逐项核对，不能由零标记推定完整闭包。

## 原生16：完整引擎及poll/PE通过，修正geometry来源检查

[原生16](https://github.com/DenisZheng/NexaTerm/actions/runs/39255798956)（code6e1f8fd）实际完成全部15依赖、IPv6/AppID/XCB-first/font探针、XDMCP/Winsock/relocate配置、完整server make及XWin.exe链接。实际os archive的UDP回环就绪/零超时、make install及递归普通/延迟AMD64 PE导入和DLL提供者归属均通过；随后geometry来源门禁失败，整次仍为FAIL。静态map、完整编译输入与最终-version尚未运行，不能把此处的编译里程碑称为全部原生门禁成功。

实际下载单JSON artifact：ZIP241406字节、SHA256 b3eff269a5c6f86c804d411a4513f561ead61e546b5043b1975e012c81842153。XWin.exe为2451933字节、SHA256 da253d418dbe2ceff1abb4aed52978ba6abba15e6bf6acdfef9c17c9b1b35de1，未发布二进制；配置hash与五项真实目标探针已核对。code6e1f8fd同时已过source CI19（21+60）及完整应用CI686七执行job：Rust617/618/620、二进制各19/集成各1，前端1160/1todo、脚本193/3既有环境skip、安全18/0skip；条件打包跳过。source19两JSON归档85272字节、SHA256 ba566bcc44cd1caad0dfb580b359234d8d683aee6ff82d93459d93216a301407，全部15项源码/签名及manifest pin一致。

此次失败来自本刀错误的检查假设：强制观察xorgproto legacy私有副本，而固定server全部include实际指向自身xkb/xkbgeom.h（17461字节、SHA256 770c4b7d41b7d87300c8b092afd0c1190a528750349befcc7bbf7e2c1ba32d8f）及include/xkbstr.h（20471字节、SHA256 74805f13f671025a231792abb07546c7f0efe250aee535362e4586d0e1eda6a3），均保留完整SGI宽松许可。移除未使用的legacy副本/额外include树，公共客户端头仍归libX11；新增两份真实server文件锚点（总21），分别要求xkb.c与xkbUtils.c的实际依赖包含它们，并拒绝客户端头替代。真实GCC回归生成同一in-tree包含链，另覆盖未用legacy副本、缺结构头或缺编译单元不能通过。

编译输入失败现在保留受限的当前raw/resolved路径；已完成DLL包许可证据在进入后续门禁前写入报告，避免后序失败丢失。新门禁仍须完整Windows执行，不覆盖原生16的FAIL，也不借用其旧结果完成新代码。

## 原生17：真实server头通过，补默认manifest的源证据

[原生17](https://github.com/DenisZheng/NexaTerm/actions/runs/39259636713)（codec2ca16f）完成62项Windows回归、15依赖、五探针、完整编译/链接/安装及16文件PE递归。771份真实Automake记录证明GDI、AppID、winmsg和两个核心XKB单元已编译，内置server geometry/结构头被实际使用，DirectDraw、propkey和无许可调试表均未包含。修正后的geometry门禁已通过；最终静态map随后在工具链自动带入的default-manifest.o处缺少随包notice而FAIL，完整C输入/最终版本probe未执行。

实际下载单JSON artifact，ZIP242336字节、SHA256 efabecaadaeda3550555080cd64d31de54c804bb5b671d53d982cbd7f08ee72b。四个目标工具链DLL的实际包版本与五份许可hash均已同固定官方原文匹配；不能用此匹配替代完整来源/发行批准。code c2ca16f的source CI20（21+62）与完整CI687七执行job全部成功；source20两JSON归档85272字节、SHA256 1d32d7dab7c09dad858dc37f6eb9254d32d29ecc0bc09d1cbbc76091d77ae9b9，全部15源码/签名与manifest一致。

default-manifest包无安装notice，但固定发布包、配方/生成器hash、完整文件集合和源仓库BSD许可已取得；新增严格单对象sourceLicenseEvidence，保留其与包声明的Public Domain不同层次及未批准发行。未知包/版本/声明/额外文件/字节漂移继续失败，没有通用缺许可豁免，也不虚构已安装的许可证。静态map现同编译输入一样保留前序结果及当前失败输入。本地89回归无skip，新代码须重新取得Windows结果。逐项主来源与实际许可hash、新发现的xkbcomp/XKB数据缺口、DLL内部静态/资源及GPL运行库本体义务见[运行库许可实证](windows-runtime-license-review.md)。整体任务仍in_progress。

## 原生18：固定manifest源证据通过，识别真实内存BFD输入

[原生18](https://github.com/DenisZheng/NexaTerm/actions/runs/39266054986)（code60ac904）完成68项Windows回归、15依赖、五探针、完整引擎/PE/头来源门禁；default-manifest实际SDK对象892字节/hash与固定发布包一致，独立源notice/版本/声明/完整集合核验通过，保留空licenseFiles及未批准发行。八个目标/开发工具链包与102份完整静态输入已保留，随后XWin_exe_rtr000000.o按磁盘文件查找而失败，整次FAIL。单JSON归档249532字节、SHA256 0264c0b0990d3a25aca31b3a4ce64bea555f8ad775f233dfd43a1da84b267d71已下载核对。source CI21（21+68）与完整CI688七执行job全成功，source21归档85272字节/hash fa9e254fb21a2018e535772af0f828299858a15c5ebc1110d8fa35858670c38b全部pin一致。

固定MSYS2 binutils2.47-4配方（git blob691df75193a196cfb83ce6aaa1bbcf1f71f94f2b）指定官方binutils2.47.tar.bz2，SHA256 3068128c75cda9f898ccb4211d360246e8e195ffcc9dfb655b23ae23a54800e8。实际下载匹配后读取ld/pe-dll.c，104369字节/hash 5b2d9a049c76e58796c6568a6035750f990089afe0e5733b62a5be3fbe8e05f0：rtr/ertr经bfd_create/make_writable/make_readable创建内存对象，dll stuff为SEC_IN_MEMORY的导出/基址重定位填充对象，均不是本应留在磁盘的源码对象。未复制这份GPL链接器实现；工具许可不自动决定输出数据或应用的许可。

新门禁采集真实GCC选中的ld程序hash/owner/精确版本/工具许可；只接受已核对的rtr/ertr/dll stuff类型，将非discarded map贡献绑定到实际PE的.rdata/.edata/.reloc字节、RVA/文件偏移和hash，核对V2伪重定位表及实际relocator符号。保留inputFilePresent=false与inputFileSha256Available=false，未知缺文件/producer漂移/磁盘同名影子/缺贡献/重叠/越界或修改数据继续FAIL。

本地真实GNU PE linker已复现内存输入和最终贡献，作为格式回归不执行也不冒充Windows运行证据。新增Windows早期真实数据DLL/非零偏移初始化探针，在重库编译前实际运行并核对同一类map/PE贡献。现本地98项无skip；真实Windows仍须验证，原生18失败保留。完整C输入及最终版本probe仍未运行，整体任务保持in_progress。

## 原生19与source22：早期producer/跨主机夹具修正

code e751827的[原生19](https://github.com/DenisZheng/NexaTerm/actions/runs/39274327395)已通过77项Windows回归，随后在重库构建前的producer版本检查FAIL。实际包仍为2.47-4；独立下载[官方UCRT64发布包](https://packages.msys2.org/package/mingw-w64-ucrt-x86_64-binutils)，6625838字节、SHA256 c18a40b871bfddb5da030f015003479ca85625afde1cb89f7313945e6151397d，与公布hash一致。真实ld.bfd.exe为1930154字节、SHA256 a279cc83f198a606f255a597b3a067b51f11a9bbf8fe46de2a0dc8bb71b47f4f，ld.exe及target路径为其包内硬链接；内置版本为GNU ld (GNU Binutils) 2.47.20260726，不能将包版本与无日期banner等同。现固定完整banner及发布二进制hash，保留归档独立分离签名未核验；失败也保留已采集producer信息。原生19单JSON归档90276字节/hash ab8cd57062b50ad5d2038dcf5b6db94cc5d77358bff629978ecf4f84ccf121f7已下载检查。

[source22](https://github.com/DenisZheng/NexaTerm/actions/runs/39274327348)与[source23](https://github.com/DenisZheng/NexaTerm/actions/runs/39275251281)的主机格式夹具均为五FAIL/一ERROR；Windows对应77/79项已通过。实际runner为Ubuntu22.04，其GNU ld2.38把内存对象前缀生成为字面量(null)，不是没有生成伪重定位。已独立下载Canonical官方2.38-4ubuntu2.12的binutils-x86-64-linux-gnu（2323634字节/hash 6752566855c79448f8173e61eacde2ef582299480f1abcf4c2ba7ce84718ef32）和libbinutils（662922字节/hash c5a7c354cf986126edc80ec615c0041c19e5b554433857cc66858803d4552296，匹配官方包页），仅在scratch提取运行，真实map已复现相同(null)名称。测试夹具只对已识别2.38 banner将该前缀适配到固定目标格式，不改地址、节或PE字节；生产仍仅接受固定2.47 producer和XWin_exe名称，并新增(null)不能获得缺文件豁免的回归。

夹具另显式启用auto-import，四字节偏移以原始八字节整数和独立BFD_RELOC_64记录保留；实际objdump核对原始值4及AMD64 ADDR64，避免ELF RELA到COFF时丢失非零加数。GNU as官方.reloc说明明确不同目标对加数的支持不同。现本地101项无skip；独立旧2.38工具链十项相关回归也全部通过。新代码仍须完整远端验证；原生20进行中，未据步骤运行推定早期探针或全引擎已经成功。
