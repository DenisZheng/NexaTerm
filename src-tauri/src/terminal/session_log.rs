//! 显式会话日志的文件写入核心；尚不连接终端输出或 IPC。
//! 集成时必须在后台有界队列中运行，且先完成用户确认及实例绑定。
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

pub const MAX_LOG_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogState {
    Recording,
    Stopped,
    LimitReached,
    Failed(io::ErrorKind),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LogStatus {
    pub state: LogState,
    pub bytes_written: u64,
}

// 不派生 Debug，避免未来 sink 中的路径或缓冲内容进入诊断。
pub struct SessionLog<W: Write> {
    sink: Option<W>,
    limit: u64,
    status: LogStatus,
}

impl SessionLog<File> {
    /// 仅创建新文件；调用方负责用户确认和所选目录的信任边界。
    pub fn create(path: &Path, limit: u64) -> Result<Self, io::ErrorKind> {
        validate_limit(limit)?;
        if !path.is_absolute() {
            return Err(io::ErrorKind::InvalidInput);
        }
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(path).map_err(|error| error.kind())?;
        Self::new(file, limit)
    }
}

impl<W: Write> SessionLog<W> {
    fn new(sink: W, limit: u64) -> Result<Self, io::ErrorKind> {
        validate_limit(limit)?;
        Ok(Self {
            sink: Some(sink),
            limit,
            status: LogStatus {
                state: LogState::Recording,
                bytes_written: 0,
            },
        })
    }

    pub fn status(&self) -> LogStatus {
        self.status
    }

    /// 只接收解码后的输出。终止后不再写入，也不自动恢复。
    pub fn append(&mut self, output: &str) -> LogStatus {
        if self.status.state != LogState::Recording {
            return self.status;
        }
        let remaining = (self.limit - self.status.bytes_written) as usize;
        let mut end = output.len().min(remaining);
        while !output.is_char_boundary(end) {
            end -= 1;
        }
        let mut offset = 0;
        while offset < end {
            let result = self
                .sink
                .as_mut()
                .expect("recording sink")
                .write(&output.as_bytes()[offset..end]);
            match result {
                Ok(0) => return self.fail(io::ErrorKind::WriteZero),
                Ok(written) => {
                    offset += written;
                    self.status.bytes_written += written as u64;
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return self.fail(error.kind()),
            }
        }
        if end < output.len() || self.status.bytes_written == self.limit {
            return self.finish(LogState::LimitReached);
        }
        self.status
    }

    pub fn stop(&mut self) -> LogStatus {
        if self.status.state == LogState::Recording {
            self.finish(LogState::Stopped)
        } else {
            self.status
        }
    }

    fn fail(&mut self, kind: io::ErrorKind) -> LogStatus {
        self.status.state = LogState::Failed(kind);
        drop(self.sink.take());
        self.status
    }

    fn finish(&mut self, state: LogState) -> LogStatus {
        // 先释放文件，再返回终止状态。flush 不代表 fsync 或断电持久性。
        if let Some(mut sink) = self.sink.take() {
            if let Err(error) = sink.flush() {
                self.status.state = LogState::Failed(error.kind());
                return self.status;
            }
        }
        self.status.state = state;
        self.status
    }
}

fn validate_limit(limit: u64) -> Result<(), io::ErrorKind> {
    if limit == 0 || limit > MAX_LOG_BYTES {
        Err(io::ErrorKind::InvalidInput)
    } else {
        Ok(())
    }
}

#[cfg(test)]
#[path = "session_log_tests.rs"]
mod tests;
