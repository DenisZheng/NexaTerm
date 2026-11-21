# 固定预编译运行库上游归档（X0）

## 1. 范围 / 触发

为随包前源码供给审查取得 GCC、pixman、zlib 三份已声明归档的完整字节。仅采集，不解包、不执行源码/配方，不修改应用、引擎、网络或依赖。winpthreads 的精确 VCS 导出、独立签名、DLL内部贡献、逐文件许可和分发批准不属于此完成范围。

## 2. 入口 / 签名

`python scripts/xserver_windows_upstream.py --cache <scratch> --report <json> [--offline]`。

`collect_sources(cache, *, offline=False, result=None, assets=ASSETS)`：复用 `collect_materials` 本次重新验证四份实际包/provider/BUILDINFO/精确PKGBUILD，不信任外部JSON的成功标志。无URL、checksum、许可或下载预算的CLI覆盖。

## 3. 契约

- 三份归档 URL/hash 来自原固定 `prebuilt-runtime-materials.json` 的 `sourceReferences`，新增 `upstreamArchiveSize` 为真实压缩字节长度。完整 URL 集合恰好为 GCC16.2.0、pixman0.46.4、zlib1.3.2；必须还有一份明确待验的 winpthreads VCS 引用。
- 本次核验后的PKGBUILD必须包含声明的归档SHA256；VCS的commit/export checksum也必须出现，引用URL与固定仓库/commit一致。这是已评审固定配方的字节绑定，不是通用shell解释器或声明已构成完整可重建源码。
- 复用 `cached_material` 的下载、原子缓存、拒绝损坏cache和leaf symlink。新入口独立传入128MiB上限/600秒总预算/30秒socket timeout；原包/配方仍为8MiB/120秒。读取前后检查截止；阻塞read可能持续至socket timeout。
- 仅固定官方HTTPS URL和zlib仓库编号2359378的官方release-assets CDN路径可通过；CDN短期签名query只供下载、不写入JSON/文件名。完整size/hash始终决定实际输入。无归档解析、提取或程序执行；所有外部源码字节只留忽略的cache。
- 成功：`REVIEW-REQUIRED`、`observationsComplete/sourceArchiveBytesVerified=true`，三个archive分别记录provider、版本、原URL/size/hash、精确配方commit/hash及`signatureVerified/inventoryReviewed=false`。
- 始终false：`upstreamSourceMaterialsComplete`、`distributionApproved/bundled/desktopVerified`、包/上游签名、DLL内部、逐文件许可、`sourceDistributionApproved`。`pendingVcs`保留精确commit/export checksum，重现标志false。`providerBinding=fixed-baseline-reference`及历史native引用不能改写成当前原生构建证据。
- 失败先清空旧成功；保留当次已核验归档和固定错误码/当前包，不输出源码、工具诊断、本机路径或短期CDN URL。报告直接位于hash cache根目录时拒绝且不删除可能的输入。写入失败不能留旧PASS。CI仅上传显式JSON，20分钟总job预算不等于产品连接超时。

## 4. 校验 / 错误矩阵

| 条件 | 结果 |
| --- | --- |
| 四包/配方和三归档完整字节匹配 | REVIEW-REQUIRED / exit0；VCS/签名/许可仍待验 |
| 包/provider/hash/BUILDINFO漂移 | 沿用PREBUILT_*或INPUT_*，先于任何源码下载失败 |
| URL或归档集合变化 | UPSTREAM_URL / UPSTREAM_SOURCE_SET |
| SHA256或VCS引用未绑定实际PKGBUILD | UPSTREAM_RECIPE_CHECKSUM / UPSTREAM_VCS_REFERENCE |
| 大小/hash不符、离线缺输入、损坏cache、超时 | INPUT_SIZE / INPUT_SHA256 / PREBUILT_OFFLINE_MISSING / PREBUILT_DOWNLOAD_*；不自动刷新 |
| report可能覆盖cache输入 / 写入失败 | UPSTREAM_REPORT_IN_CACHE / REPORT_WRITE；非零退出 |

## 5. 正常 / 基准 / 反例

正常：下载完整固定源码归档，匹配已核验配方引用，保留源码供给未批准。基准：离线复查报告逐字节相同。反例：用有效包签名或source URL声明代替实际源码字节，或将三份归档通过写成全部source/VCS已供给。

## 6. 必需测试

`python -m unittest discover -s scripts -p xserver_windows_upstream_test.py -v`；同步运行全部prebuilt回归。自写四包夹具经真实tar只读核验，源码夹具故意无需为可解析归档，断言仅作字节核验且未解包。覆盖实际集合缺失/重复、配方checksum/VCS不匹配、坏包先失败、大小/hash/预算/离线/损坏缓存、官方CDN重定向/恶意URL、旧成功/写入失败、报告输入别名及输出隐私；大源码预算不能影响原包预算。在线真实归档与离线重跑单独留收据，mock不是网络或签名证据。

## 7. 错误 / 正确

错误：修改旧prebuilt采集器的全局8MiB预算以适应107MiB GCC，把VCS引用当已重现，或在报告中保留GitHub短期签名链接。

正确：仅源码入口传入独立预算，报告固定上游URL与已核验字节，所有待验义务继续明确false。
