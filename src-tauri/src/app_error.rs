use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    /// 原始错误文本。仅供 Rust 内部诊断与测试断言使用。
    ///
    /// `#[serde(default)]` 是必需的：本结构体除了作为 IPC 线上类型，还被
    /// `terminal::session` 的 `to_russh_error` / `app_error_from_russh`
    /// 用作「序列化成 JSON 塞进 `io::Error`，再解析回来」的内部传递通道。
    /// 一旦后续给该字段加上 `skip_serializing`，缺少 default 会让那条通道
    /// 解析失败，从而把 `host_key_unknown` 这类具体错误静默降级成通用错误码。
    #[serde(default)]
    pub raw_message: String,
    pub recoverable: bool,
    /// 诊断关联 ID：用户侧只看到这个随机 ID，内部日志按它定位具体失败。
    /// 旧客户端/旧序列化数据缺该字段时按空串处理，不影响解析。
    #[serde(default)]
    pub diagnostic_id: String,
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
        }
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
        assert!(decoded.recoverable);
    }

    #[test]
    fn round_trip_preserves_diagnostic_id() {
        let original = AppError::new("probe_code", "探针错误。", "raw", false);
        let encoded = serde_json::to_string(&original).expect("序列化必须成功");
        let decoded: AppError = serde_json::from_str(&encoded).expect("反序列化必须成功");

        assert_eq!(decoded.diagnostic_id, original.diagnostic_id);
        assert_eq!(decoded.raw_message, original.raw_message);
        assert!(!decoded.recoverable);
    }
}
