# 许可证审计基线

> 本文记录当前可见元数据和缺口；Rust crate 元数据已通过 `cargo metadata --locked --offline` 获取，bundled binary 和平台安装器仍需复核。

## 1. 项目许可证

- 顶层 `LICENSE` 为 MIT，需求文档也将主许可证定为 MIT。
- 当前未发现 `THIRD_PARTY_LICENSES.md`，发布产物没有可复核的第三方 notices 基线。
- package.json、Tauri 配置和品牌元数据仍出现 m-xterm/MXterm；改名任务必须保留许可证、更新和数据目录兼容。

## 2. npm 依赖初查

package-lock v3 共约 192 个包。按 lock metadata 统计：MIT 159、MPL-2.0 1、Apache-2.0 OR MIT 13、MIT OR Apache-2.0 5、Apache-2.0 2、CC-BY-4.0 1、MPL-2.0 OR Apache-2.0 1、ISC 6、CC0-1.0 1、BSD-3-Clause 1、0BSD 1。

重点直接依赖：

| 依赖 | 版本/许可证 | 义务 |
| --- | --- | --- |
| @novnc/novnc | 1.7.0 / MPL-2.0 | 保留版权和许可证；修改文件需遵守 MPL 文件级 copyleft |
| dompurify | lock 中双许可证 MPL-2.0 OR Apache-2.0 | 记录选用条款和版本，结合安全升级复核 |
| React、Radix、Tauri JS、xterm、Monaco、zustand、lucide | 主要 MIT/Apache-2.0/ISC | 归档版权/许可证文本 |
| simple-icons | CC0-1.0 | 记录公共领域声明及图标来源 |
| 其它 transitive | 见 package-lock | 生成完整清单，不只列 direct deps |

package-lock 与 pnpm lock 同时存在，需决定唯一发布安装来源，避免两套解析结果产生 license/SBOM 漂移。

## 3. Rust、资源和二进制缺口

- Cargo.lock 不含完整 license metadata；当前已生成 708 个 crate 的 Cargo metadata，1 个 crate 未声明许可证。`cargo-deny` 无 `deny.toml` 时不能直接作为许可证合规结论，需后续配置策略。
- 审计 `src-tauri/tauri.conf.json` 的 icons、SQLite bundled、`mxterm-mcp` sidecar、FreeRDP/外部 RDP、noVNC/websocket runner、串口平台库和 installer toolchain。
- 盘点字体、图标、图片、prototype 资产、下载/打包进程和平台 runner 的版权及再分发条款。
- 对 MPL 依赖保留原始文件边界、版权头和许可证文本；不能把协议不清晰或 GPL/AGPL/LGPL 代码直接复制到仓库。

## 4. 执行计划

1. 选定 lockfile/包管理器，使用固定 registry 和 lockfile 安装。
2. 运行 `cargo deny check licenses bans advisories sources`、npm license scanner/SBOM 和构建产物清单。
3. 建立 `THIRD_PARTY_LICENSES.md`：包名、版本、许可证、来源、修改状态、归档路径和再分发限制。
4. 对 bundled binary/platform runner 记录来源、版本、hash、许可证和是否由用户单独安装。
5. 在 CI 中检查新依赖必须有许可证和许可证文本；高 copyleft/未知协议阻断发布。
6. 重新打包并人工抽查安装器、sidecar、icons/fonts 和 notices 是否随产物提供。

## 当前限制

本轮没有复制第三方代码、没有新增依赖，也没有生成最终 notices；上述内容属于审计基线。cargo license、binary hash、签名/公证和完整 SBOM 需在后续任务中取得工具和平台环境后补齐。
