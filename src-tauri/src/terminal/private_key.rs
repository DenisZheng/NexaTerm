//! SSH 私钥加载：统一入口，按文件头分流 PuTTY PPK 与 OpenSSH / PEM。
//!
//! 只在这里构造私钥相关的 `AppError`，调用方（终端 / SFTP / jump / tunnel 共用的认证路径）
//! 直接 `?` 即可。`raw_message` 只放底层错误文本，不放文件内容或路径。

use std::path::Path;

use russh::keys::{decode_secret_key, PrivateKey};
use ssh_key::Error as SshKeyError;

use crate::app_error::AppError;

/// PPK 文件头前缀（v2 / v3 共用）。
const PPK_HEADER_PREFIX: &str = "PuTTY-User-Key-File-";

/// 读取并解析私钥。
///
/// - 文件读不到 → `terminal_private_key_not_found`
/// - 需要口令 / 口令错误（PPK 与 OpenSSH 均适用）→ `terminal_private_key_passphrase`
/// - 其它格式 / 算法问题 → `terminal_private_key_invalid`
pub fn load_private_key(path: impl AsRef<Path>, passphrase: Option<&str>) -> Result<PrivateKey, AppError> {
    let text = std::fs::read_to_string(path.as_ref()).map_err(|error| {
        AppError::new(
            "terminal_private_key_not_found",
            "无法读取私钥文件。",
            error,
            true,
        )
    })?;
    parse_private_key(&text, passphrase)
}

/// 纯解析（便于单测，不碰文件系统）。
pub fn parse_private_key(text: &str, passphrase: Option<&str>) -> Result<PrivateKey, AppError> {
    let passphrase = passphrase.filter(|value| !value.is_empty());
    if is_ppk(text) {
        return PrivateKey::from_ppk(text, passphrase.map(str::to_string)).map_err(map_ppk_error);
    }
    decode_secret_key(text, passphrase).map_err(map_openssh_error)
}

fn is_ppk(text: &str) -> bool {
    text.trim_start_matches('\u{feff}')
        .trim_start()
        .starts_with(PPK_HEADER_PREFIX)
}

fn map_ppk_error(error: SshKeyError) -> AppError {
    // ssh-key 未公开 `ppk::PpkParseError`，只能按 `Error::Ppk` 的 Display 文本分类：
    // "private key is encrypted" 表示缺口令，"incorrect MAC" 表示口令错误或文件损坏。
    let message = error.to_string();
    let is_ppk = matches!(error, SshKeyError::Ppk(_));
    if is_ppk && message.contains("private key is encrypted") {
        return AppError::new(
            "terminal_private_key_passphrase",
            "该 PPK 私钥已加密，请填写口令。",
            error,
            true,
        );
    }
    if is_ppk && message.contains("incorrect MAC") {
        return AppError::new(
            "terminal_private_key_passphrase",
            "PPK 口令错误或文件已损坏。",
            error,
            true,
        );
    }
    AppError::new(
        "terminal_private_key_invalid",
        "PPK 私钥格式或算法不支持。",
        error,
        true,
    )
}

fn map_openssh_error(error: russh::keys::Error) -> AppError {
    let needs_passphrase = matches!(
        &error,
        russh::keys::Error::KeyIsEncrypted
            | russh::keys::Error::SshKey(SshKeyError::Encrypted)
            | russh::keys::Error::SshKey(SshKeyError::Crypto)
    );
    if needs_passphrase {
        AppError::new(
            "terminal_private_key_passphrase",
            "私钥需要口令，或口令错误。",
            error,
            true,
        )
    } else {
        AppError::new("terminal_private_key_invalid", "私钥读取失败。", error, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 夹具来自 ssh-key crate 测试目录（MIT，RustCrypto），均为公开示例密钥，非任何真实系统凭据。
    const PPK_ED25519: &str = include_str!("fixtures/id_ed25519.ppk");
    const PPK_ED25519_ENC: &str = include_str!("fixtures/id_ed25519_enc.ppk");
    const PPK_RSA_V2: &str = include_str!("fixtures/id_rsa_3072.ppk2");
    const PPK_PASSWORD: &str = "123";

    fn openssh_ed25519() -> String {
        let key = parse_private_key(PPK_ED25519, None).unwrap();
        key.to_openssh(ssh_key::LineEnding::LF).unwrap().to_string()
    }

    #[test]
    fn ppk_v3_without_passphrase_loads() {
        let key = parse_private_key(PPK_ED25519, None).unwrap();
        assert_eq!(key.algorithm(), ssh_key::Algorithm::Ed25519);
    }

    #[test]
    fn ppk_v2_rsa_loads() {
        let key = parse_private_key(PPK_RSA_V2, None).unwrap();
        assert!(matches!(key.algorithm(), ssh_key::Algorithm::Rsa { .. }));
    }

    #[test]
    fn ppk_encrypted_with_correct_passphrase_loads() {
        let key = parse_private_key(PPK_ED25519_ENC, Some(PPK_PASSWORD)).unwrap();
        assert_eq!(key.algorithm(), ssh_key::Algorithm::Ed25519);
    }

    #[test]
    fn ppk_encrypted_with_wrong_passphrase_is_passphrase_error() {
        let error = parse_private_key(PPK_ED25519_ENC, Some("wrong")).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_passphrase");
    }

    #[test]
    fn ppk_encrypted_without_passphrase_is_passphrase_error() {
        let error = parse_private_key(PPK_ED25519_ENC, None).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_passphrase");
        let error = parse_private_key(PPK_ED25519_ENC, Some("")).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_passphrase");
    }

    #[test]
    fn openssh_key_still_loads_and_matches_ppk_key() {
        let from_openssh = parse_private_key(&openssh_ed25519(), None).unwrap();
        let from_ppk = parse_private_key(PPK_ED25519, None).unwrap();
        assert_eq!(from_openssh.public_key().to_bytes().unwrap(), from_ppk.public_key().to_bytes().unwrap());
    }

    #[test]
    fn garbage_is_invalid_error() {
        let error = parse_private_key("not a key at all", None).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_invalid");
        let error = parse_private_key("PuTTY-User-Key-File-9: ssh-ed25519\nEncryption: none\n", None).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_invalid");
    }

    #[test]
    fn missing_file_is_not_found_error() {
        let error = load_private_key("/nonexistent/nexaterm-test.ppk", None).unwrap_err();
        assert_eq!(error.code, "terminal_private_key_not_found");
    }

    #[test]
    fn bom_and_leading_whitespace_do_not_break_ppk_detection() {
        let text = format!("\u{feff}\n{PPK_ED25519}");
        assert!(is_ppk(&text));
    }
}
