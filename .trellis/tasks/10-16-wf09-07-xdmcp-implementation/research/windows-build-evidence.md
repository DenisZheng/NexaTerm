# X0 Windows原生构建与依赖/许可证据（2026-10-19）

本刀沿Draft #84固定输入继续，不重做源码采集入口。Draft #85堆叠#84，仍为开发构建；发行批准、bundled、desktop均false。15个依赖官方归档及51项许可文件hash见`scripts/xserver/windows-sources.json`。这些锚点证明核查了哪些文本，不是整个编译/运行闭包的MIT结论。

## 当前继续入口

先核对[Draft #85](https://github.com/DenisZheng/NexaTerm/pull/85)最新HEAD和原生workflow，不把下文历史失败当作最新结果。code69a1467的完整应用CI681全部7个执行job与source CI14已成功（条件打包为既有skip）；原生11的43项证据反例、真实IPv6探针和libX11完整编译/安装已成功，安装owner检查随后发现XKBgeom.h覆盖并保持FAIL。当前修正客户端/服务端头上下文后继续后续库、引擎、PE及运行库验证，不能标记native build完成。原生11 artifact12169040787已实际下载：仅一个JSON，归档SHA256 2517e88da8c008125fe8a7793d5b9616390876515b6e0ddcf079f64fb0d41870；报告确认nativeIpv6Headers.verified=true，distributionApproved/bundled/desktopVerified仍false。

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
