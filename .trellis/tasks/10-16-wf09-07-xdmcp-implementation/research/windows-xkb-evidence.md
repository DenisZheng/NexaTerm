# Windows XKB runtime continuation（2026-10-20）

沿当前XDMCP任务的X0继续，基于Draft #85的8c3e90b，不重开计划。该基线完整CI695（39362180783）、source28（39362180852）与原生25（39362180789）全部SUCCESS；原生25执行93回归和整条引擎门禁。artifact12238852113已实际下载：ZIP451200字节，SHA256 `92c76dc2dbf59e4d6ffeeade4ef4443ebc86d493fcab14ce6c40e34b15c75481`；实际15组件/16 PE/105链接/942成员/1720 C输入与最终版本probe完整，全部C输入与原生24相同，发行/随包/桌面字段均false。#85正文已同步结果，无代码改动。

## 固定官方输入

| 输入 | 字节 | SHA256 |
| --- | --- | --- |
| xkbcomp-1.5.0.tar.xz | 247996 | 2ac31f26600776db6d9cd79b3fcd272263faebac7eb85fb2f33c7141b8486060 |
| 对应分离签名 | 95 | e339d7265ed85396bc8c3fb78116f63a46ccde336c32e3b419082e55d5c0417b |
| xkeyboard-config-2.48.tar.xz | 953316 | b77041324f0109f77161ee43743fe04baa485866af8460d31e476ad3f7648fd5 |
| 对应分离签名 | 310 | ea077c1a328d65c01e349dbefd7ee350a7c85ac36cb58a79ab0ba92e13211ea4 |

主来源为[官方应用目录](https://xorg.freedesktop.org/releases/individual/app/)与[官方数据目录](https://xorg.freedesktop.org/releases/individual/data/xkeyboard-config/)，版本/签名URL全部固定于windows-sources.json。xkbcomp用已有完整证书3C2C43D9447D5938EF4551EBE23B7E70B467F0BF：epoch1764734671、DSA/SHA1，继续保留旧密码学审查。数据包用RSA2048证书FFB4CCD275AAA422F5F9808E0661D98FC933A145：epoch1782003973、RSA/SHA512；实际977字节公钥SHA256 `df6d6bbab768604fafbdf2b3c609cf6b1225ae971893d8827bf5b1ca1c120d83`，从固定Ubuntu公钥查询取得。按既有公钥处理规范仅移除未认证armor Comment末尾一个空格；仓库证书976字节、SHA256 `3bd219b811a66c97214067e6a6e65a527b379122d06eb070cc5b4d61ea92995f`，实际dearmor后二进制证书逐字节相同。两者已通过现有隔离完整指纹/有效期/状态门禁；17份实际依赖签名本地离线复核成功。

xkbcomp COPYING为4394字节、SHA256 `6b833fdc05906ce57f016dc791db86830d49ee4da2861ce45806c50b3f4dda9e`，包含SGI、Open Group及Digital不同声明。实际随包xkbparse.c为GNU Bison3.8.2生成，120541字节、SHA256 `171cb2bbfc545058624152d4dd5a887df71895a50b03909c2c414d2da9193e0f`，保留GPL3+及parser skeleton special exception；要求实际C依赖观察此文件，不把工具许可证直接当作输出许可。外部实现未复制入仓库。

数据包COPYING为9495字节、SHA256 `fc03f6535d16b3fe9beece45b84214a37e6ca4b6550c03cadaed7e1b951fb294`，含多组声明，不能给所有数据盖统一MIT章。rules/generator模块声明MIT；实际规则模板/兼容表/模块逐文件hash已固定。symbols/us仍有独立BSD外链，symbols/ir保留历史GPL与明确MIT/X11再许可说明；相应完整权限/notice采用审查继续开放，不从关键词扫描推断通过。

## 本刀行为与证据范围

2.48归档包含446条目：399普通文件、39目录、8符号别名，原始普通字节9462203。别名只允许精确symbols/caps、esperanto、grp、japan、korean、lv2、lv3、lv5及对应同目录目标/字节pin，转换为普通文件（40961字节另计）。默认解包仍拒绝其他链接、硬链接、链式目标与路径越界。真实两归档解包与精确meson适配均本地验证。

使用版本化share/xkeyboard-config-2目录，精确移除两个legacy安装symlink块，保留上游数据生成和安装目标；不加系统目录、提权或开发者模式要求。独立运行固定官方生成器产生base/evdev规则及9份compat symbols，共11个LF规范化参考，分别保留实际原始生成/安装字节身份。C编译清单将xkbcomp计为compiler，将数据组件明确列runtime-data-only。

实际目标探针用私有libxkbfile解析base/evdev、pc105、US/DE五组件名。原生xkbcomp以独立-I清空默认搜索路径，仅给私有根，编译四份XKM、反编译验证AD06/AB01的Y/Z互换；空数据根必须退出1且不生成XKM，不存在规则必须由目标探针退出3。XWin和xkbcomp两个PE根分别递归核对，XWin的既有105输入/成员门禁不被解释成工具或DLL内部链接证据。

本地检查及新代码的真实Windows/完整CI结果，在本分支堆叠Draft正文以精确SHA、run、artifact列出；不得借用8c3e90b或4e4e4a8的原生结果证明新增键盘功能。整体任务保持in_progress，distributionApproved/bundled/desktopVerified仍false；安装/签名、真实桌面、完整notice/运行库/资源闭包与X3继续实质开发。
