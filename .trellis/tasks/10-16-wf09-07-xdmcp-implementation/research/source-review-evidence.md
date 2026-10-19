# X0 固定源码核验与构建审查输入（2026-10-19）

状态：本刀实现源码证据采集入口；X0整体、随包引擎、安装/签名及桌面仍未完成。没有采用发行组件、复制外部实现或修改许可证门禁。

## 精确输入与实际验证

| 输入 | 字节数 | SHA256 |
| --- | ---: | --- |
| 官方 `xorg-server-21.1.25.tar.xz` | 5,086,684 | `6ad4e3c7b59a309b32c92e5c15ce1267110f9e13f1ac78da62361a628da1a0eb` |
| 同名分离签名 `.sig` | 95 | `d9a3ddac6b72ad2e0f85ded64f8e9f3e69f889fb4e20c903daf8622123d03a57` |
| 固定ASCII公钥（不是私钥） | 1,598 | `bc15a0a9ef7cf3d7e8290db3a280caf4440f74aa00d6f08e2ec00ef08486d081` |

归档/签名来自[官方发布目录](https://xorg.freedesktop.org/releases/individual/xserver/)，公钥来自[完整指纹查询](https://keys.openpgp.org/vks/v1/by-fingerprint/3C2C43D9447D5938EF4551EBE23B7E70B467F0BF)。完整指纹 `3C2C43D9447D5938EF4551EBE23B7E70B467F0BF` 亦见[发行版维护者历史校验记录](https://lists.archlinux.org/pipermail/arch-commits/2020-November/849463.html)。这锁定本次审查的公钥，不等于建立新的全项目签名信任/算法批准策略。

本地真实联网下载、SHA256和隔离`gpgv`验证均成功；另用同一入口完成离线复验。签名epoch1791337345，主/签署指纹相同，算法17（DSA）、1024位公钥、摘要2（SHA-1）。没有使用允许弱算法选项、绕过验证或联网导入信任。**旧算法待审查**；密码学验证只证明这些字节与固定公钥的签名一致，不批准发行。

实际归档1,825项：1,661普通文件、164目录、35,498,753普通文件字节，无链接。工具对全部普通文件输出大小/hash，对10个构建/许可文件核对固定锚点；不提取、执行或上传第三方源码。归档元数据和尾部填充也受42MiB实际解压预算约束。

## Windows 构建审查事实

所有以下路径均指上述已签名归档；精确文件SHA256见 `scripts/xserver/upstream-source.json`，并由工具复核。这里只列构建输入，未声称已经得到依赖闭包或编译成功。

| 源码锚点 | 已读取事实 | 后续证据 |
| --- | --- | --- |
| 根`meson.build`、`configure.ac` | 上游直接区分Cygwin与Windows/MinGW，原生路径已有构建目标 | 固定工具链、库源码及参数后实际configure/compile，不能推断现成可用 |
| `hw/xwin/meson.build` | Cygwin目标名XWin，非Cygwin名Xming；Windows含pthread/ws2_32及dxguid/shlwapi/ole32/dwmapi，GLX路径另加opengl32 | 这个源码目标名不代表采用同名外部商业发行包；实际PE静态对象/导入DLL及功能仍待核对 |
| 同文件、`hw/xwin/winclipboard/meson.build` | xcb及aux/image/ewmh/icccm/composite/xfixes依赖；clipboard静态目标参与服务器链接，另有独立xwinclip工具 | 不能凭“direct query”就认定能删除clipboard、整个工具安装树均为必需或所有库许可已审完 |
| 根`meson.build`、`os/meson.build` | 公共pixman、xkbfile、xfont2和协议头等；SHA1实现提供CryptoAPI等选择 | 根据实际Windows构建profile缩小直接/传递库、键盘/字体/认证资源，不能先承诺不含OpenSSL或Cygwin运行库 |
| 根`COPYING` | 汇集X11/MIT/BSD/SGI等许可文本 | 继续逐编译单元及依赖审查、notice与分发义务；顶层文本不能覆盖整个闭包 |
| `hw/xwin/xdmcphostselect.c` | 官方21.1.25归档不存在该文件，工具断言其缺席 | 先前聚合候选的无独立许可头问题不能直接套到此上游；也不能因此豁免其余源码/依赖 |

本刀未编译上游，也未指定未经运行验证的最小构建profile。下一刀以这些固定输入推进原生Windows构建依赖和逐文件许可闭包，再取得实际PE/资源清单；需要下游修改时先审查相应文件，不复制未批准实现。

## 可重复执行入口

```bash
python -m unittest discover -s scripts -p xserver_source_review_test.py -v
python scripts/xserver_source_review.py --cache-dir /tmp/xserver-source-cache --report /tmp/xserver-review.json
python scripts/xserver_source_review.py --cache-dir /tmp/xserver-source-cache --offline --report /tmp/xserver-review-offline.json
```

结果必须是`REVIEW-REQUIRED`、`integrityVerified=true`、`distributionApproved=false`、`bundled=false`；退出0仅表示采集完成。损坏输入、签名错误/超时/缺工具或归档异常退出1、替换旧报告为FAIL。代码契约见 `.trellis/spec/backend/xserver-source-review.md`。

本地21项单测通过，无skip；真实在线采集与离线复验通过。专用workflow执行同一批单测和真实下载/GPG核验，仅上传一个JSON报告，contents只读、不持久化checkout凭据、无continue-on-error。远端精确提交与最终CI结果见下节。

## 首次 CI 安全命中审查

CI668的脱敏artifact定位到manifest两行：`keySha256`为公开公钥文件的SHA256，`os/auth.c`为固定官方源码文件的SHA256；原始1a6d899、PR测试merge及当前工作树重复计为6条generic-api-key命中。已逐字核查与上述固定输入一致，无凭据。沿用现有精确规则/路径/完整源码行SHA256审查机制登记两条；未改scanner、历史范围、目录排除或失败策略。

新增两项测试断言改动任一hash字节、文件或规则即失效。使用校验过官方安装包SHA256的Gitleaks8.30.1执行真实安全集成测试：18项通过、0skip；其中包括临时仓库提交后删除、dirty tracked及浅克隆反例。该精确审查提交的最终CI结果见下节。

后续本地全项目扫描在`blob:none`部分克隆上达到300秒工具预算，结果为`FAIL/tool_execution_failed`，不记作通过；进程已退出。CI669完整checkout上的同版本真实安全集成18/0skip、全历史及当前跟踪文件扫描已通过（0未豁免命中），许可证门禁也通过。本地超时未被改成成功或豁免，最终证据以精确远端树为准。

## Draft #84 精确验证对象

- [Draft #84](https://github.com/DenisZheng/NexaTerm/pull/84)，分支`build/wf09-07-xserver-source-review`，堆叠基于#83；不合并、不发布。
- 最终代码`bfbd2256317bb9144bf764741ef245f5e2a7cd2b`，文件树`7d87e474f5b17e06fa57e85081045e7d10be050e`。CI的PR测试合并对象`320132c77efa2785ce189c80ca9678dd8090c207`文件树完全相同，已通过Git数据接口核对。
- [源码核验CI2](https://github.com/DenisZheng/NexaTerm/actions/runs/39183424710)：21项单测通过、无skip；真实在线下载及隔离GPG核验通过。已下载检查远端artifact12157291591，ZIP SHA256 `ce72c28c9a7d7a6c1a1241c669dee94954319042353900252b0b35a6688c4603`；仅`xserver-review.json`，manifest hash一致，1661个普通文件hash齐全，状态/未批准/未随包字段与契约一致。未上传源码或引擎二进制。
- 远端JSON与本地离线复验逐字节一致，JSON SHA256 `37c50276e05d98dbaa02a9e17f666d46c927f0aefd627b0e21d471a845b7e861`，不以不同ZIP容器时间戳推断源码变化。
- [完整CI669](https://github.com/DenisZheng/NexaTerm/actions/runs/39183424729)：全部7个执行job SUCCESS（三平台Rust、前端、安全、许可证、fixture）；条件Windows打包job为既有skip，不是安装包证据。前端139文件1160通过/1既有todo、脚本193通过/3既有环境skip；真实安全回归18项无skip、完整历史及当前文件扫描0未豁免命中。依赖审计npm4/Rust19为REVIEW-REQUIRED报告采集，不代表风险验收。
- 同次Rust库测试：Linux617通过/4既有ignored、macOS618通过/0ignored、Windows620通过/0ignored；各平台另有binary19、integration1、doc0通过。未新增skip/ignore，完整应用现有协议/资源生命周期测试均继续执行。
- 本地TypeScript、源码21项、真实安全集成18项、脚本193通过/3既有环境skip、line-budget/任务manifest/diff检查通过。完整项目本地历史扫描超时边界见上文；没有本地Rust工具链，不记作原生验证。

后续仅文档/任务记录提交不改变上述代码验证对象。X0整体、Windows原生构建/许可闭包、PE/资源、随包打包/签名、桌面、X3和Unix宿主硬崩溃监督仍未完成；整体任务不归档。
