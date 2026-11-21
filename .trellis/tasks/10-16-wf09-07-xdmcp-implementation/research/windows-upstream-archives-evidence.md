# 固定上游归档字节门禁（2026-11-21）

本节保留源码阶段执行结果。同日维护者随后确认暂缓剩余VCS/独立签名/许可与资源分发产品化，本节末尾的“下一项”不再是当前开发指令；当前顺序与恢复审批以根目录`ROADMAP.md`为准。

沿用当前任务、`build/wf09-07-resource-audit` / HEAD `56ca831`。维护者接受三桌面人工验收后，继续X0既定源码供给准备，不再次开启桌面窗口、不引入发行组件。

## 实现范围

新增 `scripts/xserver_windows_upstream.py`。先在本次实际核验四个固定包、provider、BUILDINFO、精确PKGBUILD及原始notice，再采集GCC/pixman/zlib已声明的完整官方归档。固定清单只新增三个真实压缩长度，版本/hash/URL沿用原声明。源码checksum和winpthreads的commit/export checksum绑定本次核验后的配方字节；不执行shell或makepkg，不解包/编译外部源码。

复用原有缓存、流式下载、临时文件与原子写入；源码独立128MiB/600秒预算不放宽原8MiB/120秒包/补丁边界。zlib实际使用官方release-assets CDN，其临时签名URL不写入收据。报告拒绝覆盖cache输入、开工前清除旧成功，失败保留固定错误与本次完成子项。源码CI增加只上传JSON的门禁，job上限由10调至20分钟以容纳GCC大归档；本次未提交/推送，未取得新CI。

## 实际在线 / 离线结果

Windows Python全新忽略cache在线采集成功，随后同cache离线复查成功；两份JSON逐字节相同：3934字节，SHA256 `536abc31404ed3c896fd4bd811cbbfb49ae22e277e217d8ec8f41850a2b0f7f5`。报告身份为`fixed-baseline-reference`，明确保留历史native基线，不冒充本次原生引擎构建。

| 归档 | 压缩字节数 | SHA256 |
| --- | ---: | --- |
| GCC16.2.0 | 107200820 | `e6738e29597f733270731aa90600f37ffdc045079dfc27ec7e8192cc81085c3e` |
| pixman0.46.4 | 660536 | `a098c33924754ad43f981b740f6d576c70f9ed1006e12221b1845431ebce1239` |
| zlib1.3.2 | 1320064 | `d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3` |

共109181420字节；上游原始内容和包/配方材料只在 `.trellis/.runtime/xdmcp-upstream-20261121/cache`，不提交或包含在构建产物。

## 自动化与边界

- Windows与WSL：新增13项反例、原prebuilt18项均通过。自写包经真实tar核验；源码夹具只验证完整字节，不伪称已解析/解包。
- 覆盖缺失/重复输入集合、source checksum/VCS与配方不一致、坏包先于源码下载失败、大小/hash/离线/损坏cache/预算、恶意重定向、报告输入别名、旧成功及报告写入失败。明确断言原包默认预算不被改变，报告无本机路径、源码正文或CDN签名。
- MSYS使用其`/usr/bin/python`的整套200项通过；首次误选UCRT原生Windows Python出现8失败/12错误，集中在未改动的POSIX路径/映射夹具。改用正确解释器后全部通过，不为此放宽生产路径校验或改夹具。没有重建完整X引擎，不使用受杀软干扰的安装prefix证明引擎可用。
- `npm run check`、line-budget、Trellis manifests及差异空白检查通过。Windows Node脚本199项为186通过/10失败/3跳过；10项均为既有Save As POSIX shell/symlink夹具，Windows无对应路径/创建symlink权限。WSL同文件11项全部通过；不伪称Windows全量PASS、不修改系统权限或无关测试。Gitleaks实扫3项仍明确skip。

成功仅为`REVIEW-REQUIRED`，`sourceArchiveBytesVerified/observationsComplete=true`。`upstreamSourceMaterialsComplete`、所有发行/随包/桌面、独立包/上游签名、DLL内部、逐文件许可、源码供给批准均false；三个归档`inventoryReviewed/signatureVerified=false`。winpthreads精确commit/export checksum列为待验，不把引用写成实际完整VCS导出。

下一项是winpthreads精确VCS export checksum独立复现与独立包/源码签名；随后仍须DLL内部贡献、实际成员许可/源码供给安排和资源授权的明确人审。此阶段不批准原样分发，不关闭X01/X3或归档整体任务。
