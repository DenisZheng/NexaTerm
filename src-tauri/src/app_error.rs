use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::known_hosts::HostKeyInfo;

/// 需要随错误一起交给前端消费的结构化载荷。
///
/// 它是带判别的枚举而不是自由 JSON：每一个变体都要在这里显式登记，
/// 前端按 `kind` 匹配即可，不需要对错误文本做形状嗅探。载荷之所以不能
/// 继续借道 `raw_message`，是因为后者要按 `design.md` §5.3 第 3 步
/// 从 IPC 线上移除；诊断文本和前端契约载荷是两种不同性质的数据，
/// 混在一个字段里会让「关闭原始文本」这件事在语义上无法完成。
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppErrorDetails {
    /// 首次连接该主机，需要用户确认主机密钥（TOFU）。
    HostKeyUnknown { host_key: HostKeyInfo },
    /// 主机密钥与已信任记录不一致，连接已被阻断。
    HostKeyChanged {
        host_key: HostKeyInfo,
        old_fingerprint_sha256: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    /// 原始错误文本。仅供 Rust 内部诊断与测试断言使用，**不向 WebView 暴露**。
    ///
    /// IPC 序列化时该字段被 `skip_serializing` 摘掉，用户侧只通过
    /// `diagnostic_id` 对内部日志定位。反序列化仍保留（`#[serde(default)]`），
    /// 因为内部 JSON 通道要把值原样带回来。
    #[serde(default, skip_serializing)]
    pub raw_message: String,
    pub recoverable: bool,
    /// 诊断关联 ID：用户侧只看到这个随机 ID，内部日志按它定位具体失败。
    /// 旧客户端/旧序列化数据缺该字段时按空串处理，不影响解析。
    #[serde(default)]
    pub diagnostic_id: String,
    /// 前端需要消费的结构化载荷；大多数错误没有，故省略序列化。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<AppErrorDetails>,
}

impl AppError {
    pub fn new(code: &str, message: &str, raw_message: impl ToString, recoverable: bool) -> Self {
        let diagnostic_id = Uuid::new_v4().to_string();
        log_diagnostic(code, &diagnostic_id, recoverable);
        Self {
            code: code.to_string(),
            message: message.to_string(),
            raw_message: raw_message.to_string(),
            recoverable,
            diagnostic_id,
            details: None,
        }
    }

    /// 附加结构化载荷。只在少数需要前端二次决策的错误上使用（如主机密钥确认）。
    pub fn with_details(mut self, details: AppErrorDetails) -> Self {
        self.details = Some(details);
        self
    }

    /// 内部通道专用序列化：把 `raw_message` 一起带上。
    ///
    /// `terminal::session` 的 `to_russh_error` / `app_error_from_russh` 用
    /// 「序列化成 JSON 塞进 `io::Error`，再解析回来」传递错误。这条通道在进程内，
    /// 没有「不向 WebView 暴露原始文本」的约束，因此必须保留 `raw_message`——
    /// 直接用 `serde_json::to_string` 会因 `skip_serializing` 把它丢掉，
    /// 使主机密钥等错误在跨 russh 边界后失去内部诊断能力。
    pub fn to_internal_json(&self) -> String {
        let mut value = match serde_json::to_value(self) {
            Ok(value) => value,
            Err(_) => return self.message.clone(),
        };
        if let Some(object) = value.as_object_mut() {
            object.insert(
                "raw_message".to_string(),
                serde_json::Value::String(self.raw_message.clone()),
            );
        }
        value.to_string()
    }
}

/// 写入内部诊断日志。
///
/// 只记录 `diagnostic_id` + 失败类别（`code`/`recoverable`），**不记录 `raw_message`**：
/// 原始错误文本可能嵌入命令原文、主机路径、代理地址等敏感内容，而日志的留存周期
/// 和访问面都比进程内的错误值宽。`raw_message` 仍完整保留在 `AppError` 值里，
/// Rust 内部诊断与测试断言照常可用。
fn log_diagnostic(code: &str, diagnostic_id: &str, recoverable: bool) {
    eprintln!("app_error code={code} diagnostic_id={diagnostic_id} recoverable={recoverable}");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_host_key() -> HostKeyInfo {
        HostKeyInfo {
            host: "example.com".to_string(),
            port: 22,
            key_algorithm: "ssh-ed25519".to_string(),
            fingerprint_sha256: "SHA256:abcdef".to_string(),
            public_key: "AAAAC3Nza".to_string(),
        }
    }

    #[test]
    fn diagnostic_id_is_generated_per_error_and_is_not_empty() {
        let first = AppError::new("probe_code", "探针错误。", "raw", true);
        let second = AppError::new("probe_code", "探针错误。", "raw", true);

        assert!(!first.diagnostic_id.is_empty());
        assert_ne!(
            first.diagnostic_id, second.diagnostic_id,
            "每次构造都必须是独立 ID，否则无法在日志里区分两次失败"
        );
    }

    /// 内部 JSON 通道（`to_russh_error` / `app_error_from_russh`）依赖缺字段可解析。
    #[test]
    fn missing_optional_fields_still_deserialize() {
        let encoded = r#"{"code":"host_key_unknown","message":"x","recoverable":true}"#;
        let decoded: AppError = serde_json::from_str(encoded).expect("缺少可选字段时必须仍可解析");

        assert_eq!(decoded.code, "host_key_unknown");
        assert_eq!(decoded.raw_message, "");
        assert_eq!(decoded.diagnostic_id, "");
        assert_eq!(decoded.details, None);
        assert!(decoded.recoverable);
    }

    #[test]
    fn round_trip_preserves_diagnostic_id() {
        let original = AppError::new("probe_code", "探针错误。", "raw", false);
        let encoded = serde_json::to_string(&original).expect("序列化必须成功");
        let decoded: AppError = serde_json::from_str(&encoded).expect("反序列化必须成功");

        assert_eq!(decoded.diagnostic_id, original.diagnostic_id);
        assert!(!decoded.recoverable);
    }

    /// `design.md` §5.3 第 3 步：原始错误文本不得出现在 IPC 线上表示里。
    #[test]
    fn ipc_serialization_drops_raw_message() {
        let error = AppError::new(
            "probe_code",
            "探针错误。",
            "ssh2://user:secret@10.0.0.1/private",
            false,
        );
        let encoded = serde_json::to_string(&error).expect("序列化必须成功");

        assert!(
            !encoded.contains("secret"),
            "IPC 序列化不得携带 raw_message，实际得到：{encoded}"
        );
        assert!(!encoded.contains("raw_message"));
        assert!(encoded.contains(&error.diagnostic_id));
    }

    /// 内部通道仍需完整的 `raw_message`，否则跨 russh 边界后诊断信息丢失。
    #[test]
    fn internal_json_preserves_raw_message() {
        let original = AppError::new("host_key_unknown", "需要确认主机密钥。", "raw-detail", true);

        let decoded: AppError =
            serde_json::from_str(&original.to_internal_json()).expect("内部通道必须可解析回来");

        assert_eq!(decoded.raw_message, original.raw_message);
        assert_eq!(decoded.diagnostic_id, original.diagnostic_id);
        assert_eq!(decoded.code, original.code);
    }

    /// 主机密钥载荷必须能以判别联合的形式跨 IPC 往返，前端不再解析 `raw_message`。
    #[test]
    fn details_survive_ipc_round_trip() {
        let error = AppError::new("host_key_unknown", "首次连接。", "raw", true).with_details(
            AppErrorDetails::HostKeyUnknown {
                host_key: sample_host_key(),
            },
        );

        let encoded = serde_json::to_string(&error).expect("序列化必须成功");
        let decoded: AppError = serde_json::from_str(&encoded).expect("反序列化必须成功");

        assert_eq!(
            decoded.details,
            Some(AppErrorDetails::HostKeyUnknown {
                host_key: sample_host_key()
            })
        );
        assert!(encoded.contains(r#""kind":"host_key_unknown""#));
    }

    /// 没有载荷的错误不应在线上表示里凭空多出 `details` 字段。
    #[test]
    fn details_field_is_omitted_when_absent() {
        let error = AppError::new("probe_code", "探针错误。", "raw", true);
        let encoded = serde_json::to_string(&error).expect("序列化必须成功");

        assert!(!encoded.contains("details"));
    }

    /// 主机密钥变更载荷需同时带新旧指纹，前端要并列展示才能让用户判断风险。
    #[test]
    fn host_key_changed_details_carry_old_fingerprint() {
        let error = AppError::new("host_key_changed", "主机密钥已变化。", "raw", true).with_details(
            AppErrorDetails::HostKeyChanged {
                host_key: sample_host_key(),
                old_fingerprint_sha256: "SHA256:old".to_string(),
            },
        );

        let encoded = serde_json::to_string(&error).expect("序列化必须成功");

        assert!(encoded.contains("SHA256:old"));
        assert!(encoded.contains(r#""kind":"host_key_changed""#));
    }
}
