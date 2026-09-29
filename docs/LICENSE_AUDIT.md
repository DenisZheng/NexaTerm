# 许可证审计与发布基线

> 状态：P2-5 自动化闭环已实现；真实 tagged installer 的人工抽查仍属于发布验收。

## 1. 项目许可证与唯一依赖来源

- 顶层 `LICENSE` 为项目 MIT 许可证。
- JavaScript 包管理器固定为 `pnpm@11.22.0`，唯一 lockfile 为 `pnpm-lock.yaml`。
- Rust 依赖固定由 `src-tauri/Cargo.lock` 驱动。
- 仓库提交 `THIRD_PARTY_LICENSES.md` 作为随发行物分发的人工 notice。
- CI / Release 从实际安装的 pnpm graph 与 `cargo metadata --locked` 生成精确 transitive inventory。

旧审计中关于 `package-lock.json` 的统计属于历史状态；当前主线不存在 package-lock，不再把它作为发布许可证来源。

## 2. 自动化许可证门禁

`scripts/license-inventory.mjs`：

1. 枚举 `node_modules/.pnpm` 内实际安装的 npm package manifests；
2. 调用 `cargo metadata --locked` 获取 Cargo package 的 name/version/license/source；
3. 输出：
   - `logs/licenses/license-inventory.json`
   - `logs/licenses/THIRD_PARTY_LICENSES.generated.md`
4. 按 `scripts/license-policy.json` fail closed。

当前策略：

- 无 license metadata：阻断；
- 只有无法自动判定的 license-file 引用：需要 package-specific review；
- SPDX `OR` 按“可任选其一”处理：存在可接受的宽松分支时不因另一个 GPL/LGPL/MPL 分支误阻断；
- SPDX `AND` 按“必须同时遵守”处理：任一必需分支触发 blocked/manual-review 即 fail closed；
- AGPL / GPL / SSPL / BUSL / Commons-Clause：当它们是不可绕开的必需分支时阻断；
- MPL / LGPL / EPL / CDDL：当它们是不可绕开的必需分支时必须有 package-specific manual review；
- 已人工审批 package 的 license expression 发生变化：阻断，要求重新审查。

MPL 不作为全局豁免。当前明确审批仅覆盖实际已知的 noVNC 与 serialport；新增 MPL 包仍会失败。

## 3. 重点发行组件

机器可读的 bundled/external inventory 位于：

`docs/legal/bundled-components.json`

重点：

| 组件 | 分发方式 | 许可证/状态 | 处理 |
| --- | --- | --- | --- |
| @novnc/novnc | frontend bundle | MPL-2.0 | package-specific review；保留 MPL/source notice |
| serialport-rs | compiled Rust dependency | MPL-2.0 | package-specific review；保留 MPL/source notice |
| SQLite via rusqlite bundled | compiled | Public Domain | 在 THIRD_PARTY notice 记录 upstream |
| mxterm-mcp | bundled sidecar | 项目 MIT | first-party source |
| FreeRDP/xfreerdp | external runner | 外部安装 | NexaTerm 不重分发其 binary |
| XQuartz | external X server | 外部安装 | NexaTerm 不重分发 |
| Linux X11/XWayland | system/user component | 外部安装 | NexaTerm 不重分发 |

Simple Icons package 声明 CC0-1.0；品牌标志仍可能受 trademark/brand policy 约束，因此 notice 明确不把 CC0 package license 解读为商标授权。

## 4. Notice 随发行物

`src-tauri/tauri.conf.json` 将以下文件作为 bundle resources：

- `LICENSE`
- `THIRD_PARTY_LICENSES.md`

Release workflow 同时：

- 在每个平台构建前运行 license gate；
- 保存每个平台的 generated inventory；
- Windows portable ZIP 显式放入 LICENSE + THIRD_PARTY_LICENSES；
- GitHub Release 根目录附带 LICENSE + THIRD_PARTY_LICENSES；
- source archives 自然包含同一套文件。

因此 notices 不再只存在于源码仓库。

## 5. CI / Release 证据

常规 CI 有独立 `License compliance` job：

- pnpm frozen install；
- Rust toolchain；
- exact npm/Cargo inventory；
- policy gate；
- 上传 30 天 license evidence artifact。

Tagged/manual release 在打包前运行同一个 gate。License gate 失败时不会继续产出可发布 bundle。

## 6. 仍需发布人工验收

自动门禁不能代替最终安装器抽查。正式 tagged release 时仍需确认：

1. Windows 安装后资源目录/portable ZIP 可找到 notices；
2. macOS `.app` resource 与 DMG 分发内容可找到 notices；
3. Linux AppImage/deb/rpm 的资源安装位置可找到 notices；
4. 平台 packager/runtime 若引入新的 bundled binary，其许可证进入 `docs/legal/bundled-components.json` 或自动 inventory；
5. 对生成的 inventory diff 做 release review，尤其关注新 copyleft/custom license。

这部分与 Authenticode / notarization 一样，属于真实发行凭据与 installer smoke 阶段，而不是源码层缺口。
