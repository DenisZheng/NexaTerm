# PR #89：预编译运行库包与配方材料阶段

日期：2026-10-31。沿用 `10-16-wf09-07-xdmcp-implementation` / `build/wf09-07-resource-audit` / Draft PR #89，不新建任务或 PR，不合并或发版。

## 当前范围

新增只读采集器将上一阶段成功原生 `41170743513` / `15e4dae890a0930cec5abf7e5f1d4e608d4a9056` 的四个实际 provider 绑定到固定官方包、全部普通成员、元数据、精确配方和 notice。原生构建新增门禁必须绑定**当次** provider，不能只引用旧报告；独立源码 CI 则明确为固定基线引用模式。实现契约见 `.trellis/spec/backend/xserver-windows-prebuilt.md`。

阶段状态：**包/精确配方材料阶段完成**。代码 `d18b6511d8ffb59b17f8b9c5c6461ba6dd59ed42` 的完整/源码/原生 CI 均成功，精确 artifact 已独立下载核验。完成的是本阶段材料门禁，整体任务保持 in_progress；不合并、不发版。

## 本阶段 CI 与 artifact

| 门禁 | 精确 run | 结果 |
| --- | --- | --- |
| 完整 CI | `41175645356` | 七个实际执行 job 全 SUCCESS；条件 Windows 打包 job 未触发 |
| 固定源码/依赖/预编译材料 | `41175645308` | SUCCESS；真实官方包/精确配方核验通过，baseline-reference 模式 |
| Windows 原生 | `41175645305` | SUCCESS；187 项反例、完整引擎构建、资源门禁、新材料门禁及最终版本 probe 通过 |

- 原生 artifact `13034205012`：ZIP 656281 字节，SHA256 `1fce9d1c71842ed17299466587035ef50afcd5ed4950aff159d17ca981d50464`，与 GitHub digest 独立比对一致。只含 `xserver-windows-review.json`，3873696 字节，SHA256 `b0623626561f6b39d8522c86a5b4a7bcfc19771fa31b9443e731f471c287f022`。
- 源码 artifact `13033115820`：ZIP 95216 字节，SHA256 `ccb979d76089245b7d7567132a49931243b514751959b16b61fcc46b289493ed`。只含既有两份 source/dependency JSON 和新增 `xserver-prebuilt-review.json`；新增 JSON 47027 字节，SHA256 `d62791e314133ff745e28548cbd5e41c2cd4c545babbefc5eb1a5d78f6f942b6`。
- 原生 `prebuiltRuntimeMaterials.providerBinding=enclosing-native-report`，四个 provider 与当次 `privatePeLinkage.prebuiltDllsExcluded` 完整相同；其包/成员/notice/recipe/source 声明与独立源码 CI 材料逐字段相同。没有把独立基线引用冒充当次原生观察。
- 原生根报告 `status=REVIEW-REQUIRED, stage=complete`，`nativeBuildVerified/nativeVersionVerified=true`；所有发行/随包/桌面与新增未完成字段仍为 false。JSON 只作为审查 artifact，不包含包、补丁正文或引擎二进制。

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
- 新增 18 项反例在 Windows Python、MSYS Python、WSL Python 均通过；测试用自写普通 tar，经真实 tar 读取到 stdout，不解包到目录。覆盖 provider/版本/notice 漂移、BUILDINFO/PKGBUILD/blob/source 声明不符、损坏缓存、unsafe URL/redirect、下载/工具超时、非零退出、成员集合/字节/预算和旧成功替换。补充复核还覆盖报告原子写入失败：开工前先移除旧报告，预检失败仍显式保留全部 false，报告与 native 输入同路径直接拒绝而不删除输入。
- MSYS 的完整 `xserver_windows_*test.py` 186 项通过，包括既有编译/链接格式夹具与 GDI 测试程序；这些不是 X server 构建/桌面验收。未重跑本机受杀软干扰的完整引擎构建，未恢复隔离文件、关闭防护或设置排除。
- WSL 全套尝试有 14 项因缺 `gcc` / `make` 出错；本阶段新增 18 项单独全过。WSL 也缺 zstd，未修改该环境；Linux 真实压缩包验证交给显式安装 zstd 的源码 CI。此环境缺口不能写成 WSL 全量通过。
- `npm run check`、行数门禁、Trellis context validate 和 `git diff --check` 通过；staged 文件逐项确认 UTF-8/LF、无 runtime/二进制及私钥/token 模式。未改变应用代码和依赖；当前代码的完整应用 CI 已通过。

## 保留边界与下一项

`distributionApproved/bundled/desktopVerified/prebuiltDllInternalsIncluded/perFileLicenseReviewComplete/packageSignaturesVerified/upstreamSourceArchivesCollected/sourceDistributionApproved` 均为 false。材料采集成功只输出 REVIEW-REQUIRED。

本阶段推进 B1 的包/配方/notice 身份部分，不关闭 DLL 内部 map/选中 archive/object/depfiles/生成与 resource 链（B2），实际成员许可/例外（B3），源码供给、安装/签名/分发方式（B4）。winpthreads 完整 VCS export checksum 与独立包/源码验签仍未完成。三个资源的授权澄清或独立替换、libgcc 本体的采用/供给方式仍需人审；不自动联系上游或代替维护者决定。X2/X3 未实施，不能宣称 XDMCP 已随包可用。
