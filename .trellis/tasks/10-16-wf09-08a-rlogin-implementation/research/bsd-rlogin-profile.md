# L1 BSD Rlogin compatibility notes

2026-10-16。候选兼容基线：NetBSD/src@341f927f96010762456f472c3baecdf28d751eb4。只读取一手协议/实现资料，未复制外部代码；此记录不等于已取得真实服务端互通证据。

## 已核对的约束

- [RFC1282](https://www.rfc-editor.org/rfc/rfc1282.html)：初始交换 ACK 只进入数据传输；urgent 控制与普通字节流分离，窗口帧须等待请求，不能当作 Telnet IAC。
- [固定版本 rlogind.c](https://github.com/NetBSD/src/blob/341f927f96010762456f472c3baecdf28d751eb4/libexec/rlogind/rlogind.c)：检查客户端源端口512–1023；不是只检查目标513。默认客户端不能静默改用高源端口。
- 同文件 NMAX=30、用户名数组 NMAX+1；读取器把结束 NUL 计入容量，因此此候选每个用户名最多30字节。终端缓冲64字节中预留 TERM= 的5字节及结尾 NUL，terminal/speed 合计最多58字节。L0 的256/64是内部上限，不是该服务端允许值；L1 必须在发送前执行 profile 更小限额，拒绝而非截断。
- [同版本原生客户端](https://github.com/NetBSD/src/blob/341f927f96010762456f472c3baecdf28d751eb4/usr.bin/rlogin/rlogin.c) 通过 MSG_OOB 获取控制并按已知位判断窗口请求、流控和 flush，flush 配合 SIOCATMARK 处理边界。L1 必须测试组合控制位和 urgent mark，不能只识别四个孤立数值或删除普通流中的同值字节。
- rlogind 的初始确认不提供完整登录/密码认证结果。L0 使用 Accepted 命名并保持不宣称已认证；L1 不能靠口令提示文本推定可靠登录状态。

## 后续实现约束

1. 先实现 Rlogin/Rsh 共用的保留端口绑定与真实能力结果，持有实际 socket 直至关闭；不安装提权 helper，不让整个 GUI 提权。
2. 原生 urgent/OOB 与 normal stream 的 mark/flush 必须由有序 owner 协调；不能在正常数据中扫描02/10/20/80就认定为控制。
3. 追加授权 loopback 原生控制/源端口/取消测试，再接 manager、单次连接许可及按需 UI。服务端字段/端口要求与操作系统权限分别报告。
4. 真实服务端登录、resize、断连/重连和三平台权限结果按 L2 单独取证；内存/回环 fixture 通过不替代此项。
