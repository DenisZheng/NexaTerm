# X0 Windows原生构建与依赖/许可证据（2026-10-19）

本刀沿Draft #84固定输入继续，不重做源码采集入口。Draft #85堆叠#84，仍为开发构建；发行批准、bundled、desktop均false。15个依赖官方归档及51项许可文件hash见`scripts/xserver/windows-sources.json`。这些锚点证明核查了哪些文本，不是整个编译/运行闭包的MIT结论。

## 首次真实Windows构建

代码`d86be6bb6968ce0468d8557b48094614008072af`，[原生构建1](https://github.com/DenisZheng/NexaTerm/actions/runs/39186069194)。Windows UCRT64环境安装成功，真实server归档/GPG核验通过，MinGW目标工具链已读取；util-macros configure/make/install通过。xorgproto configure通过，但make试图调用不存在的aclocal-1.19而失败，整次保持FAIL，不宣称原生server构建成功。

根因在本刀自写解包器：写文件后保留了mode但没有保留发行归档mtime，导致Make误判Autotools生成文件过期。修正为保留已固定归档的原始文件时间戳，并在解包测试中断言精确mtime；没有忽略Make失败、禁用规则或伪造生成结果。同时补充实际解压预算（含tar元数据/填充）及官方重定向检查。

本地包管理器因命名空间setgroups/setuid权限未能安装交叉工具链，不把本地环境当作Windows编译证据。真实构建在Windows runner执行；没有更改系统提权策略或产品能力。

## 许可/资源审查边界

- 15个依赖的51项固定许可文本均已实际读取；其中xorgproto含37份细分许可。根许可文本未见GNU copyleft段落，不据此豁免各编译单元、生成器或运行库。
- server的`winprefsyacc.c`是带Bison特殊例外的生成输出；必须保留具体来源/hash/例外条件审查，不能把其GPL标记忽略或笼统覆盖整个server。
- server本地`ddraw.h`在MinGW-w64路径转向工具链`include_next`；实际包含/运行闭包以原生构建和工具链文件核对，不能仅按该文件未展开的兼容定义给整包许可定性。
- GLX/DRI及非目标服务器关闭，XDMCP显式开启；该2D开发profile不构成完整桌面扩展/打包能力承诺。

后续继续实际构建、原生probe、PE及递归DLL来源、逐文件/编译器运行库和资源义务。当前未取得全部证据，不归档整体任务。
