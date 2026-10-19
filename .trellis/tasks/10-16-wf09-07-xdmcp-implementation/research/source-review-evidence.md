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

本地21项单测通过，无skip；真实在线采集与离线复验通过。专用workflow执行同一批单测和真实下载/GPG核验，仅上传一个JSON报告，contents只读、不持久化checkout凭据、无continue-on-error。远端精确提交/CI结果在通过后补记。
