# PR #89：预编译运行库包与配方材料阶段

日期：2026-10-31。沿用 `10-16-wf09-07-xdmcp-implementation` / `build/wf09-07-resource-audit` / Draft PR #89，不新建任务或 PR，不合并或发版。

## 当前范围

新增只读采集器将上一阶段成功原生 `41170743513` / `15e4dae890a0930cec5abf7e5f1d4e608d4a9056` 的四个实际 provider 绑定到固定官方包、全部普通成员、元数据、精确配方和 notice。原生构建新增门禁必须绑定**当次** provider，不能只引用旧报告；独立源码 CI 则明确为固定基线引用模式。实现契约见 `.trellis/spec/backend/xserver-windows-prebuilt.md`。

阶段状态：本地核验已完成，提交后的完整/源码/原生 CI 尚待本阶段精确 SHA 验证；不能借用上一阶段绿灯。整体任务保持 in_progress。

## 已实现与实际材料

| 实际包 | 版本 | 包成员 / 普通文件 | 配方目录文件 | 随包 notice |
| --- | --- | --- | --- | --- |
| libgcc | 16.2.0-6 | 11 / 6 | 19 | 2 |
| pixman | 0.46.4-3 | 19 / 10 | 1 | 1 |
| libwinpthread | 14.0.0.r569.g34eeafb7d-1 | 10 / 5 | 1 | 1 |
| zlib | 1.3.2-3 | 21 / 11 | 6 | 1 |

总计四包 61 个成员、32 个普通文件、27 个精确配方文件（4 PKGBUILD、22 patches、1 gdbinit），另加独立固定 hash 的 zlib `1165.patch`。源码归档、包本体、补丁正文均只在私有 runtime/cache，提交中只有脚本、hash/URL 清单、规范与审查记录；不复制外部实现。

- `scripts/xserver/prebuilt-runtime-materials.json` 是完整固定清单；每个 PKGBUILD SHA256 必须匹配包内 `.BUILDINFO`，不能只按版本或最新路径选配方。GCC 使用 `fb1bee30b4f11cf4b857197a288466afad49033a`；pixman 使用 `82bcf47d0ae2621e1cd00fb82c8ee5db02b91955`。
- r569/zlib -3 的精确 commit、当前 source/patch 结构及 notice 取证见 [当前配方研究](windows-prebuilt-current-recipes.md)。r569 不再包含旧 fake-libgcc 包装补丁，但上游 fakelib 规则仍存在；zlib 配方目录含 minizip 补丁，不能全部计为 zlib1.dll 的实际贡献。
- `.BUILDINFO.installed` 逐项保留为声明环境；构建环境内已安装版本可以不同于输出版本。源码 URL/checksum/PGP key 是引用，不变成 DLL 的已观察 link map，也不冒充本采集器已收集全部上游源码或独立验签。
- 基线已安装 notice 与官方包中对应 bytes/hash 完全相同；四个 DLL bytes/size/hash 与实际 provider 精确相同。

## 本地验证

- 全新缓存在线下载四个官方包、27 个配方文件和远端 patch 后通过；不是仅信任旧 pacman 缓存。
- 再用 `--offline --native-report` 复查通过，JSON 与在线结果逐字节相同。Windows 报告 48342 字节，SHA256 `690f843b2c987fd9247ea5f6f7d2b3d61d14e136f9555132ec39c1b2e1afb486`；其 supplied native JSON SHA256 为 `6e2835d865a04e2982986949fcf4166380dcd99de06fc236eed4d72718d21fb9`。
- 新增 17 项反例在 Windows Python、MSYS Python、WSL Python 均通过；测试用自写普通 tar，经真实 tar 读取到 stdout，不解包到目录。覆盖 provider/版本/notice 漂移、BUILDINFO/PKGBUILD/blob/source 声明不符、损坏缓存、unsafe URL/redirect、下载/工具超时、非零退出、成员集合/字节/预算和旧成功替换。
- MSYS 的完整 `xserver_windows_*test.py` 186 项通过，包括既有编译/链接格式夹具与 GDI 测试程序；这些不是 X server 构建/桌面验收。未重跑本机受杀软干扰的完整引擎构建，未恢复隔离文件、关闭防护或设置排除。
- WSL 全套尝试有 14 项因缺 `gcc` / `make` 出错；本阶段新增 17 项单独全过。WSL 也缺 zstd，未修改该环境；Linux 真实压缩包验证交给显式安装 zstd 的源码 CI。此环境缺口不能写成 WSL 全量通过。

## 保留边界与下一项

`distributionApproved/bundled/desktopVerified/prebuiltDllInternalsIncluded/perFileLicenseReviewComplete/packageSignaturesVerified/upstreamSourceArchivesCollected/sourceDistributionApproved` 均为 false。材料采集成功只输出 REVIEW-REQUIRED。

本阶段推进 B1 的包/配方/notice 身份部分，不关闭 DLL 内部 map/选中 archive/object/depfiles/生成与 resource 链（B2），实际成员许可/例外（B3），源码供给、安装/签名/分发方式（B4）。winpthreads 完整 VCS export checksum 与独立包/源码验签仍未完成。三个资源的授权澄清或独立替换、libgcc 本体的采用/供给方式仍需人审；不自动联系上游或代替维护者决定。X2/X3 未实施，不能宣称 XDMCP 已随包可用。
