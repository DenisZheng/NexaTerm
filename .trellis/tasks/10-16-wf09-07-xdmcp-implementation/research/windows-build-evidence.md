# X0 Windows原生构建与依赖/许可证据（2026-10-19）

本刀沿Draft #84固定输入继续，不重做源码采集入口。Draft #85堆叠#84，仍为开发构建；发行批准、bundled、desktop均false。15个依赖官方归档及51项许可文件hash见`scripts/xserver/windows-sources.json`。这些锚点证明核查了哪些文本，不是整个编译/运行闭包的MIT结论。

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
