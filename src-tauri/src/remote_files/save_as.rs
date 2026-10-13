use super::*;

/// 写完私有临时文件后精确创建目标；link 不具有 ln 的目录目标语义。
pub fn build_remote_save_as_command(path: &str) -> String {
    let quoted_path = quote_posix_shell(path);
    let tmp_suffix = uuid::Uuid::new_v4();
    format!(
        "path={quoted_path}; \
         if [ -e \"$path\" ] || [ -L \"$path\" ]; then exit 2; fi; \
         case \"$path\" in */*) dir=${{path%/*}}; [ -z \"$dir\" ] && dir=/ ;; *) dir=. ;; esac; \
         tmpdir=\"$dir/.nexaterm-save-as.{tmp_suffix}.$$\"; \
         umask 077; mkdir \"$tmpdir\" || exit 3; \
         cleanup() {{ rm -f \"$tmpdir/content\"; rmdir \"$tmpdir\"; }}; \
         trap cleanup 0; trap 'exit 3' HUP INT TERM; \
         cat > \"$tmpdir/content\" || exit 3; \
         if ! link \"$tmpdir/content\" \"$path\"; then \
           if [ -e \"$path\" ] || [ -L \"$path\" ]; then exit 2; fi; exit 3; \
         fi; exit 0"
    )
}

impl RemoteFileManager {
    pub async fn save_file_as(
        &self,
        app: &AppHandle,
        profile: ResolvedSshConfig,
        path: &str,
        content: &str,
    ) -> Result<RemoteFileWriteResult, AppError> {
        let config = RemoteFileSessionConfig::from_config(profile);
        let output = self
            .exec_with_reconnect_stdin(
                app,
                &config,
                &build_remote_save_as_command(path),
                content.as_bytes(),
                None,
            )
            .await?;
        if output.exit_status != Some(0) {
            return Err(remote_file_command_error(
                if output.exit_status == Some(2) {
                    "remote_file_exists"
                } else {
                    "remote_file_save_as_failed"
                },
                if output.exit_status == Some(2) {
                    "目标已存在，请使用新的文件名。"
                } else {
                    "远程文件另存为失败。"
                },
                &output,
            ));
        }
        let metadata = self
            .metadata(app, &config, path)
            .await
            .map_err(|error| {
                AppError::new(
                    "remote_file_save_as_metadata_failed",
                    "新文件已创建，但无法读取其属性。请刷新目录后检查。",
                    error.raw_message,
                    true,
                )
            })?;
        Ok(RemoteFileWriteResult {
            metadata,
            conflict: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_as_builder_quotes_path_and_publishes_exact_target_without_overwrite() {
        let command = build_remote_save_as_command("/srv/quoted ' $(unsafe).txt");
        assert!(command.starts_with("path='/srv/quoted '\\'' $(unsafe).txt';"));
        assert!(command.contains("link \"$tmpdir/content\" \"$path\""));
        assert!(command.contains("umask 077; mkdir"));
        assert!(command.contains("trap cleanup 0"));
        assert!(!command.contains("mv "));
        assert!(!command.contains("ln "));
    }
}
