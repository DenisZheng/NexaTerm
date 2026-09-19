# SSH 私钥支持 PuTTY PPK 格式

> 插队任务（2026-09-19）：Task 04 分屏冒烟时用户用 PPK 私钥连接失败，暴露为 `terminal_private_key_invalid`。目标用户群大量持有 PPK，属一等需求；与需求文档 §45 russh 升级范围一致。

## Goal

SSH 认证接受 PuTTY PPK（v2 / v3，含口令与无口令）私钥文件，与 OpenSSH / PEM 走同一入口；SFTP、jump host、tunnel 共用同一认证路径自动获益。不改前端、不改连接数据模型。

## Confirmed Facts

- `src-tauri/src/terminal/session.rs:1963` 用 `russh::keys::load_secret_key` 读取私钥，它只解析 OpenSSH / PEM；PPK 直接报 `terminal_private_key_invalid`（日志诊断 ID `510b12ae-…`）。
- 依赖树里 `ssh-key 0.7.0-rc.10` 自带 `PrivateKey::from_ppk(text, passphrase)`（`ppk` feature），项目未启用；russh 0.61.1 对 ssh-key 未暴露 ppk feature，需在 `Cargo.toml` 直接依赖 `ssh-key` 并开 feature（同版本，不引入新解析器）。
- 全仓库只有这一处私钥加载点，SFTP/jump/tunnel 均经此路径。
- PPK 文件头固定为 `PuTTY-User-Key-File-<N>: <alg>`，可无歧义分流。

## Requirements

1. 新增 `src-tauri/src/terminal/private_key.rs`：`load_private_key(path, passphrase) -> Result<PrivateKey, PrivateKeyLoadError>`；按文件头分流 PPK / 其它，其它仍走 `decode_secret_key`。
2. 错误分层为稳定 code：`terminal_private_key_not_found`（读文件失败）、`terminal_private_key_passphrase`（PPK 或 OpenSSH 需要口令 / 口令错误）、`terminal_private_key_invalid`（格式或算法不支持）；`raw_message` 保留底层错误文本，不含文件内容。
3. `session.rs` 改调新 loader；`AppError` 构造集中在 loader 的错误映射，调用点只做一次 `map_err`。
4. 单测（`private_key.rs` 内）：测试时用 `ssh-key` 生成 Ed25519 密钥，导出 OpenSSH 与 PPK v3（无口令 / 有口令），覆盖：OpenSSH 回归、PPK 无口令、PPK 正确口令、PPK 错口令 → passphrase code、PPK 缺口令 → passphrase code、乱文件 → invalid、不存在路径 → not_found。
5. 前端 `connectionErrorCodes.ts` 若有按 code 的提示映射，补两条新 code 的文案；没有则不改。
6. `cargo test --workspace --locked` 本机通过；CI 三平台绿。

## Acceptance Criteria

- [ ] 用户手上的 PPK 可直接连接（GUI 验收，与 Task 04 分屏冒烟同一次完成）。
- [ ] 上述 7 个单测通过；OpenSSH 密钥行为无变化。
- [ ] 错误 code 与文案区分“口令问题”和“格式问题”。
- [ ] `cargo deny check advisories` 无新增条目（ssh-key ppk feature 只拉 hex/hmac/sha1，均已在树中或为纯 Rust）。

## Out of Scope

- 不做 PPK → OpenSSH 的转换/导出 UI；不做 Pageant/agent 转发；不改连接弹窗表单。
