# Windows private DLL/tool linkage continuation（2026-10-20）

沿现有XDMCP任务X0接续，不重开计划。基线为[Draft #86](https://github.com/DenisZheng/NexaTerm/pull/86)代码 `9a815d5b7c0c6b7320790ff440c33e3fb3317f11`：

- [完整CI699](https://github.com/DenisZheng/NexaTerm/actions/runs/39369157275)七执行job SUCCESS；Rust Linux617/4既有ignored、macOS618、Windows620，各19二进制和1集成通过，前端1160/1todo。
- [source32](https://github.com/DenisZheng/NexaTerm/actions/runs/39369157227) SUCCESS：21源码、111构建回归与17实际签名；artifact12240686218已下载，ZIP85547字节、SHA256 `4cf7853d5d13ba164ad8e070b87d42ead51d30db5559391feeefe307861f060d`，当前manifest及全部17身份一致。
- [Windows原生29](https://github.com/DenisZheng/NexaTerm/actions/runs/39369157188) SUCCESS。artifact12240678597实际下载，ZIP492466字节、SHA256 `df21bc8911e97002c8c970f64875e48133bc986b016170b52a4a4c8a22359484`。JSON的manifest/recipe及17组件均同当前基线，全部构建完成，stage=complete、status=REVIEW-REQUIRED；nativeBuildVerified/nativeVersionVerified=true，采用/随包/桌面均false。

原生SDK旧顺序拒绝/正确顺序诊断回调探针成功；base/evdev×US/DE四份真实XKM为11964/13048/12664/13748字节，含5/5/3/3个Ctrl-Z，AD06/AB01的Y/Z语义往返正确，空根退出1及缺规则退出3均按目标代码验证。数据293文件/3341129字节（278固定源/15实际生成）、8源码别名、11独立参考完整；1756 C输入包含固定parser。原生28的真实宏冲突失败保留在上一份键盘证据中，没有改写。

## 本刀缺口及范围

原生29的两个PE根分别为XWin16与工具8文件；共有15个不同私有PE，其中XWin单独已有105 LOAD/47 archive/942选择成员。其余为13个私有DLL和xkbcomp，之前未取得各自的map/静态成员。四个预编译提供者仍是libgcc、pixman、winpthread、zlib；已核对发布payload及notice不等于这些DLL内部已审查。

本刀从依赖配置起保留GNU map，并依实际闭包选择上述私有目标，不把所有开发工具当作发行候选。每个目标要求map输出、唯一所属构建文件、安装PE及闭包hash/size一致，再从真实链接工作目录解析LOAD与archive选择。自身构建对象、私有安装输入和工具链文件分别留实际owner；原有XWin报告不变。

GNU ld的rtr/ertr前缀源于实际输出名的ASCII规范化，沿已固定binutils2.47-4/官方`ld/pe-dll.c`来源记录扩展精确名称，不开放任意缺文件模式。实际内存对象继续核对最终PE贡献、relocator及固定producer；不复制生成器实现，也不把其GPL条款直接标给输出。Windows早期增加命名DLL和另一命名EXE的真实链接/数据导入运行，避免只以XWin命名的夹具证明通用目标路径。

初版本地144 Python回归无skip，包括真实GNU PE DLL/EXE及archive夹具、当前输出命名空间、工作目录、图像漂移、不同provider、缺map、越界/重复输出、错误目标和部分失败。Linux格式验证不替代新代码的Windows执行；新堆叠Draft的精确SHA/run结果须重新取得。

## Draft #87首次Windows失败及修复（2026-10-23）

[Draft #87](https://github.com/DenisZheng/NexaTerm/pull/87)初始代码`c595ac41f7b6c19d26544aeba3431dec08624be1`已过[完整CI700](https://github.com/DenisZheng/NexaTerm/actions/runs/39523133949)及[source33](https://github.com/DenisZheng/NexaTerm/actions/runs/39523133950)。[Windows原生30](https://github.com/DenisZheng/NexaTerm/actions/runs/39523134024)在前置123项回归中出现2个ERROR/5个FAIL，均源于私有链接夹具的`LINK_INPUT_MISSING`；构建步骤未运行，没有新引擎或JSON证据。

根因已用原始夹具和盘符map在本地复现：MinGW ld把archive写为`C:/...`，生产解析器正确调用`cygpath -u`，但夹具的无条件包名返回桩把转换结果变成了包名，随后按错误文件路径读取。修复将命令分流：真实执行路径转换，只对精确的fixture archive包归属查询返回fixture包名；其他命令拒绝。新增盘符LOAD与选择成员的完整解析回归，确认二次读取仍绑定同一实际archive字节/hash/owner。生产校验与失败策略不变。本地145项Python回归无skip通过，专门私有链接12项通过；修复后的Windows原生及完整CI需重新取得，不能借用初版或#86结果。

`privatePeLinkage`记录每个目标及明确排除的预编译DLL，保留prebuiltDllInternalsIncluded/resourceCompilerInputsIncluded/perFileLicenseReviewComplete/distributionApproved=false。实际选择成员也不代表每个最终section贡献或完整权限已关闭；资源/图标、SDK IDL、两类GCC例外、运行库本体源码供给、完整notice、打包/签名/桌面及X3仍有实质工作。任务保持in_progress，不合并、不发布。
