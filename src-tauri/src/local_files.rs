use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::app_error::AppError;

#[derive(Debug, Deserialize)]
pub struct LocalFileListRequest {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct LocalFileEntry {
    pub path: String,
    pub name: String,
    pub kind: String,
}

#[tauri::command]
pub async fn local_file_list(
    request: LocalFileListRequest,
) -> Result<Vec<LocalFileEntry>, AppError> {
    let directory = require_existing_local_directory(&request.path)?;
    let mut entries = Vec::new();
    let directory_entries = std::fs::read_dir(&directory).map_err(|error| {
        AppError::new("local_file_list_failed", "本地目录读取失败。", error, true)
    })?;

    for entry in directory_entries {
        let entry = entry.map_err(|error| {
            AppError::new("local_file_list_failed", "本地目录读取失败。", error, true)
        })?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            AppError::new("local_file_list_failed", "本地文件类型读取失败。", error, true)
        })?;
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            "other"
        };
        entries.push(LocalFileEntry {
            path: path.to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    }

    entries.sort_by(|left, right| {
        let left_rank = if left.kind == "directory" { 0 } else { 1 };
        let right_rank = if right.kind == "directory" { 0 } else { 1 };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(entries)
}

fn require_existing_local_directory(local_path: &str) -> Result<PathBuf, AppError> {
    let trimmed = local_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(
            "local_file_list_path_missing",
            "请选择本地目录。",
            "path is empty",
            true,
        ));
    }

    let path = PathBuf::from(trimmed).canonicalize().map_err(|error| {
        AppError::new("local_file_list_path_failed", "本地目录解析失败。", error, true)
    })?;
    if !path.is_dir() {
        return Err(AppError::new(
            "local_file_list_not_directory",
            "请选择有效的本地目录。",
            path.to_string_lossy(),
            true,
        ));
    }
    Ok(path)
}
