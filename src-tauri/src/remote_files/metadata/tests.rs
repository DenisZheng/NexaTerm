use super::*;

fn attributes() -> FileAttributes {
    FileAttributes {
        size: Some(33),
        mtime: Some(1_700_000_001),
        permissions: Some(0o100600),
        ..FileAttributes::empty()
    }
}

fn block_on<T>(future: impl Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("test runtime")
        .block_on(future)
}

async fn unused_sftp() -> Result<RemoteFileMetadata, AppError> {
    panic!("此分支不得访问 SFTP")
}

#[test]
fn sftp_editor_metadata_preserves_real_version_and_permissions() {
    let metadata = editor_metadata_from_sftp("/test/config.txt", attributes()).unwrap();
    assert_eq!(metadata.path, "/test/config.txt");
    assert_eq!(metadata.name, "config.txt");
    assert_eq!(metadata.size, 33);
    assert_eq!(metadata.mtime, 1_700_000_001);
    assert_eq!(metadata.mode.as_deref(), Some("600"));
}

#[test]
fn sftp_editor_metadata_rejects_missing_version_fields() {
    for missing_size in [true, false] {
        let mut attrs = attributes();
        if missing_size {
            attrs.size = None;
        } else {
            attrs.mtime = None;
        }
        assert_eq!(
            editor_metadata_from_sftp("/test/config.txt", attrs)
                .unwrap_err()
                .code,
            "remote_file_metadata_incomplete"
        );
    }
}

#[test]
fn sftp_editor_metadata_rejects_directory_symlink_and_unknown_type() {
    for permissions in [Some(0o40700), Some(0o120777), None] {
        let mut attrs = attributes();
        attrs.permissions = permissions;
        assert_eq!(
            editor_metadata_from_sftp("/test/config.txt", attrs)
                .unwrap_err()
                .code,
            "remote_file_metadata_failed"
        );
    }
}

#[test]
fn sftp_editor_metadata_accepts_explicit_zero_values() {
    let mut attrs = attributes();
    attrs.size = Some(0);
    attrs.mtime = Some(0);
    let metadata = editor_metadata_from_sftp("/test/empty.txt", attrs).unwrap();
    assert_eq!((metadata.size, metadata.mtime), (0, 0));
}

#[test]
fn successful_shell_metadata_does_not_open_sftp() {
    let output = ExecOutput {
        stdout: b"/test/config.txt\00033\0001700000001\000600\000".to_vec(),
        stderr: Vec::new(),
        exit_status: Some(0),
    };
    let metadata = block_on(resolve_editor_metadata(&output, unused_sftp())).unwrap();
    assert_eq!(metadata.size, 33);
    assert_eq!(metadata.mtime, 1_700_000_001);
}

#[test]
fn other_shell_errors_and_malformed_output_do_not_fall_back() {
    for exit_status in [None, Some(2), Some(3), Some(0)] {
        let output = ExecOutput {
            stdout: b"invalid output".to_vec(),
            stderr: b"test error".to_vec(),
            exit_status,
        };
        let error = block_on(resolve_editor_metadata(&output, unused_sftp())).unwrap_err();
        assert_eq!(
            error.code,
            if exit_status == Some(0) {
                "remote_file_metadata_parse_failed"
            } else {
                "remote_file_metadata_failed"
            }
        );
    }
}

#[test]
fn sftp_failure_remains_an_error_instead_of_an_empty_version() {
    let output = ExecOutput {
        stdout: Vec::new(),
        stderr: Vec::new(),
        exit_status: Some(4),
    };
    let error = block_on(resolve_editor_metadata(&output, async {
        Err(AppError::new(
            "remote_sftp_init_failed",
            "SFTP 会话初始化失败。",
            "test",
            true,
        ))
    }))
    .unwrap_err();
    assert_eq!(error.code, "remote_sftp_init_failed");
}

#[test]
fn sftp_versions_keep_mtime_and_size_conflicts_until_explicit_overwrite() {
    let current = editor_metadata_from_sftp("/test/config.txt", attributes()).unwrap();
    check_write_version(&current, current.mtime, current.size, false).unwrap();
    for (mtime, size) in [
        (current.mtime - 1, current.size),
        (current.mtime, current.size - 1),
    ] {
        assert_eq!(
            check_write_version(&current, mtime, size, false)
                .unwrap_err()
                .code,
            "remote_file_conflict"
        );
        check_write_version(&current, mtime, size, true).unwrap();
    }
}

#[cfg(unix)]
mod shell {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::path::PathBuf;
    use std::process::{Command, Output, Stdio};

    struct Fixture {
        root: PathBuf,
        file: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("nexaterm-no-stat-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(root.join("bin")).unwrap();
            for tool in ["wc", "cat", "chmod", "mv", "rm"] {
                let executable = ["/usr/bin", "/bin"]
                    .iter()
                    .map(|dir| PathBuf::from(dir).join(tool))
                    .find(|path| path.is_file())
                    .expect("POSIX utility");
                symlink(executable, root.join("bin").join(tool)).unwrap();
            }
            let file = root.join("quoted ' $(not-a-command).txt");
            fs::write(&file, b"original").unwrap();
            fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
            Self { root, file }
        }

        fn exec(&self, command: &str, input: &[u8]) -> Output {
            let mut child = Command::new("/bin/sh")
                .args(["-c", command])
                .env("PATH", self.root.join("bin"))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            child.stdin.take().unwrap().write_all(input).unwrap();
            child.wait_with_output().unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.root).unwrap();
        }
    }

    #[test]
    fn real_shell_without_stat_uses_sftp_metadata() {
        let fixture = Fixture::new();
        let path = fixture.file.to_str().unwrap();
        let result = fixture.exec(&build_remote_metadata_command(path), b"");
        assert_eq!(result.status.code(), Some(4));
        let output = ExecOutput {
            stdout: result.stdout,
            stderr: result.stderr,
            exit_status: Some(4),
        };
        let metadata = block_on(resolve_editor_metadata(&output, async {
            editor_metadata_from_sftp(path, attributes())
        }))
        .unwrap();
        assert_eq!(metadata.mtime, 1_700_000_001);
        assert_eq!(metadata.path, path);
    }

    #[test]
    fn save_without_stat_preserves_private_mode_and_literal_content() {
        let fixture = Fixture::new();
        let command = crate::remote_files::build_remote_write_command(
            fixture.file.to_str().unwrap(),
            Some("600"),
        );
        let content = b"local-edit=1\n$(not-a-command)\n";
        let result = fixture.exec(&format!("umask 022; {command}"), content);
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(fs::read(&fixture.file).unwrap(), content);
        assert_eq!(
            fs::metadata(&fixture.file).unwrap().permissions().mode() & 0o7777,
            0o600
        );
        assert_eq!(fs::read_dir(&fixture.root).unwrap().count(), 2);
    }

    #[test]
    fn permission_failure_keeps_original_and_cleans_temporary_file() {
        let fixture = Fixture::new();
        let command = crate::remote_files::build_remote_write_command(
            fixture.file.to_str().unwrap(),
            Some("invalid-mode"),
        );
        let result = fixture.exec(&command, b"replacement");
        assert_eq!(result.status.code(), Some(4));
        assert_eq!(fs::read(&fixture.file).unwrap(), b"original");
        assert_eq!(fs::read_dir(&fixture.root).unwrap().count(), 2);
    }
}
