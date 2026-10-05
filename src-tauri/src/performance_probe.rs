use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::app_error::AppError;

const EVIDENCE_PATH_ENV: &str = "NEXATERM_PERF_EVIDENCE_PATH";
const RUN_ID_ENV: &str = "NEXATERM_PERF_RUN_ID";

pub struct PerformanceProbeState {
    started_at: Instant,
    interactive_recorded: AtomicBool,
}

impl Default for PerformanceProbeState {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
            interactive_recorded: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceInteractiveSample {
    pub enabled: bool,
    pub recorded: bool,
    pub elapsed_ms: u64,
    pub pid: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformanceEvidenceLine<'a> {
    event: &'static str,
    elapsed_ms: u64,
    pid: u32,
    run_id: &'a str,
    unix_ms: u64,
}

#[tauri::command]
pub fn performance_probe_mark_interactive(
    state: State<'_, PerformanceProbeState>,
) -> Result<PerformanceInteractiveSample, AppError> {
    let elapsed_ms = duration_ms(state.started_at.elapsed().as_millis());
    let pid = std::process::id();
    let Some(path) = std::env::var_os(EVIDENCE_PATH_ENV).map(PathBuf::from) else {
        return Ok(PerformanceInteractiveSample {
            enabled: false,
            recorded: false,
            elapsed_ms,
            pid,
        });
    };

    if state.interactive_recorded.swap(true, Ordering::AcqRel) {
        return Ok(PerformanceInteractiveSample {
            enabled: true,
            recorded: false,
            elapsed_ms,
            pid,
        });
    }

    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::new(
                "performance_probe_evidence_dir_failed",
                "无法创建性能证据目录。",
                error,
                true,
            )
        })?;
    }

    let run_id = std::env::var(RUN_ID_ENV).unwrap_or_else(|_| "manual".to_string());
    let unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| duration_ms(value.as_millis()))
        .unwrap_or(0);
    let evidence = PerformanceEvidenceLine {
        event: "workspace-interactive",
        elapsed_ms,
        pid,
        run_id: &run_id,
        unix_ms,
    };
    let line = serde_json::to_string(&evidence).map_err(|error| {
        AppError::new(
            "performance_probe_serialize_failed",
            "无法序列化性能证据。",
            error,
            true,
        )
    })?;

    let mut output = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| {
            AppError::new(
                "performance_probe_evidence_open_failed",
                "无法打开性能证据文件。",
                error,
                true,
            )
        })?;
    writeln!(output, "{line}").map_err(|error| {
        AppError::new(
            "performance_probe_evidence_write_failed",
            "无法写入性能证据。",
            error,
            true,
        )
    })?;

    Ok(PerformanceInteractiveSample {
        enabled: true,
        recorded: true,
        elapsed_ms,
        pid,
    })
}

fn duration_ms(value: u128) -> u64 {
    value.min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::duration_ms;

    #[test]
    fn duration_conversion_saturates() {
        assert_eq!(duration_ms(1234), 1234);
        assert_eq!(duration_ms(u128::MAX), u64::MAX);
    }
}
