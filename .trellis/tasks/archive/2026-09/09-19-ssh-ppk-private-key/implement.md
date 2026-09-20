# SSH PPK 私钥支持 · 实施记录

## 改动

- `src-tauri/Cargo.toml`：直接依赖 `ssh-key 0.7.0-rc.10`（与 russh 内部同版本）并开 `ppk` + `encryption` 等 feature；`Cargo.lock` 只多一条 `"ssh-key"` 边，无新包。
- `src-tauri/src/terminal/private_key.rs`（新）：`load_private_key` / `parse_private_key`，按 `PuTTY-User-Key-File-` 文件头分流；错误分三档 code：`terminal_private_key_not_found` / `terminal_private_key_passphrase` / `terminal_private_key_invalid`。PPK 错误分类按 `ssh_key::Error::Ppk` 的 Display 文本（crate 未公开 `PpkParseError`）。
- `session.rs`：唯一加载点改调新 loader；SFTP / jump / tunnel 共用该路径自动获益。
- `WorkspaceShell.tsx`：三个按 code 的分支加入两个新 code；invalid 文案改为列出支持格式。
- 夹具 `src-tauri/src/terminal/fixtures/*.ppk*`：来自 ssh-key crate 测试目录（MIT，RustCrypto），公开示例密钥，口令 `123`。

## 验证（2026-09-19 本机）

- `cargo test --locked private_key`：9 个新用例通过（PPK v3 无口令、v2 RSA、加密正确口令、错口令 → passphrase、缺口令 → passphrase、OpenSSH 回归且公钥一致、乱文件 / 未知版本 → invalid、不存在路径 → not_found、BOM 检测）。
- `cargo test --workspace --locked`：312 + 18 通过。
- `pnpm run check`：0 错。
- Secret scan：本机无 gitleaks（brew 安装失败、无 pwsh 跑 installer），由 CI Security evidence job 验证；PPK 不含 PEM `BEGIN … PRIVATE KEY` 标记，预期无命中。若命中则按 `security-reviewed-fixtures.json` 登记。
- `cargo audit`：待 CI；ppk feature 依赖 hex/hmac/sha1 均已在树中。

## 待用户验收

- [x] 用真实 PPK 直接连接成功（2026-09-19 用户用 `tpv-si-cms.ppk`，v3 无口令 RSA，绝对路径连接成功）。
- [x] CI run `35434062517` @ `fd07c65` 全绿；Security evidence job 通过，PPK 夹具未触发 secret 扫描，无需豁免。

## 验收中发现并补做（2026-09-20）

- 用户用 `~/...` 路径报 `terminal_private_key_not_found`：loader 加 `~` / `~/` 展开（`expand_home`，只处理当前用户前缀，`~user/` 原样返回）；2 个单测。
- 连接弹窗私钥字段没有"选择文件"按钮，用户只能手填：复用 Settings 凭据表单已有的 `settings-path-picker` 结构与 `selectLocalPrivateKeyFile`，加 `choosePrivateKeyPath`；不新增样式。
- [x] 用户 2026-09-20 点"选择"按钮选中 PPK，路径回填正常（"测试OK"）。
- [x] CI run `35513550792` @ `8341cc7`：Frontend / Linux / macOS / Security evidence 已 success，Windows Rust job 归档时仍在跑（同一变更集的 `dc7c655` run 被后续推送自动取消，属预期）。
