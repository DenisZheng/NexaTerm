//! 编辑器元数据读取与保存前版本校验。缺少 stat 时使用 SFTP 属性，不降低冲突检测精度。
use std::future::Future;

use russh_sftp::protocol::FileAttributes;

use super::{
    build_remote_metadata_command, parse_remote_file_metadata, remote_file_command_error,
    remote_file_name, sftp_app_error, AppError, AppHandle, ExecOutput, RemoteFileManager,
    RemoteFileMetadata, RemoteFileSessionConfig, ReusableSftpSession,
};

impl RemoteFileManager {
    pub(super) async fn metadata(
        &self,
        app: &AppHandle,
        config: &RemoteFileSessionConfig,
        path: &str,
    ) -> Result<RemoteFileMetadata, AppError> {
        let output = self
            .exec_with_reconnect(app, config, &build_remote_metadata_command(path))
            .await?;
        resolve_editor_metadata(&output, async {
            // 仅在 stat 无法提供 mtime 时轮询此 future；沿用凭据、跳板机和 Host Key 校验。
            let session = ReusableSftpSession::connect_resolved(app, &config.resolved).await?;
            let result = session
                .sftp()
                .metadata(path.to_string())
                .await
                .map_err(|error| {
                    sftp_app_error(
                        "remote_file_metadata_failed",
                        "远程文件信息读取失败。",
                        error,
                    )
                })
                .and_then(|attributes| editor_metadata_from_sftp(path, attributes));
            session.close().await;
            result
        })
        .await
    }
}

async fn resolve_editor_metadata(
    output: &ExecOutput,
    sftp_fallback: impl Future<Output = Result<RemoteFileMetadata, AppError>>,
) -> Result<RemoteFileMetadata, AppError> {
    // build_remote_metadata_command 的 exit 4 专指 mtime 获取失败。
    // 路径/读取错误、无 exit status 和解析失败均保留原错误，不静默换通道。
    if output.exit_status == Some(4) {
        return sftp_fallback.await;
    }
    if output.exit_status != Some(0) {
        return Err(remote_file_command_error(
            "remote_file_metadata_failed",
            "远程文件信息读取失败。",
            output,
        ));
    }
    parse_remote_file_metadata(&output.stdout).ok_or_else(|| {
        AppError::new(
            "remote_file_metadata_parse_failed",
            "远程文件信息解析失败。",
            String::from_utf8_lossy(&output.stdout),
            true,
        )
    })
}

fn editor_metadata_from_sftp(
    path: &str,
    attributes: FileAttributes,
) -> Result<RemoteFileMetadata, AppError> {
    if !attributes.file_type().is_file() {
        return Err(AppError::new(
            "remote_file_metadata_failed",
            "远程路径不是普通文件，或服务器未提供文件类型。",
            "SFTP metadata does not identify a regular file",
            true,
        ));
    }
    // 传输展示可以容忍缺少可选字段，编辑冲突检测不能把缺失 size/mtime 当作零。
    let (Some(size), Some(mtime)) = (attributes.size, attributes.mtime) else {
        return Err(AppError::new(
            "remote_file_metadata_incomplete",
            "服务器未提供文件大小或修改时间，无法安全编辑。",
            "SFTP metadata lacks size or mtime",
            true,
        ));
    };
    Ok(RemoteFileMetadata {
        path: path.to_string(),
        name: remote_file_name(path),
        size,
        mtime: u64::from(mtime),
        mode: attributes
            .permissions
            .map(|mode| format!("{:o}", mode & 0o7777)),
    })
}

pub(super) fn check_write_version(
    current: &RemoteFileMetadata,
    expected_mtime: u64,
    expected_size: u64,
    overwrite: bool,
) -> Result<(), AppError> {
    if !overwrite && (current.mtime != expected_mtime || current.size != expected_size) {
        return Err(AppError::new(
            "remote_file_conflict",
            "远端文件已变化。",
            format!(
                "expected size={} mtime={}, current size={} mtime={}",
                expected_size, expected_mtime, current.size, current.mtime
            ),
            true,
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
