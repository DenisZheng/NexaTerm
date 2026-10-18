//! 双流各自保持顺序与 EOF；不把传输结束推断成远端命令退出状态。
use super::{NativeError, Signal};
use crate::legacy_socket::{NativeSocket, SocketError, MAX_CHUNK};

pub struct RshTransport {
    main: NativeSocket,
    secondary: NativeSocket,
    initial: Vec<u8>,
    initial_offset: usize,
    stdout_eof: bool,
    stderr_eof: bool,
    stdin_closed: bool,
}
impl std::fmt::Debug for RshTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str("RshTransport{..}") }
}
impl RshTransport {
    pub(super) fn new(main: NativeSocket, secondary: NativeSocket, initial: Vec<u8>) -> Self {
        Self { main, secondary, initial, initial_offset: 0, stdout_eof: false, stderr_eof: false, stdin_closed: false }
    }
    pub fn read_stdout(&mut self, buffer: &mut [u8]) -> Result<Option<usize>, NativeError> {
        validate_buffer(buffer)?;
        if self.initial_offset < self.initial.len() {
            let count = buffer.len().min(self.initial.len() - self.initial_offset);
            buffer[..count].copy_from_slice(&self.initial[self.initial_offset..self.initial_offset + count]);
            self.initial_offset += count;
            if self.initial_offset == self.initial.len() { self.initial.clear(); self.initial_offset = 0; }
            return Ok(Some(count));
        }
        if self.stdout_eof { return Ok(Some(0)); }
        let result = self.main.read(buffer)?;
        if result == Some(0) { self.stdout_eof = true; }
        Ok(result)
    }
    pub fn read_stderr(&mut self, buffer: &mut [u8]) -> Result<Option<usize>, NativeError> {
        validate_buffer(buffer)?;
        if self.stderr_eof { return Ok(Some(0)); }
        let result = self.secondary.read(buffer)?;
        if result == Some(0) { self.stderr_eof = true; }
        Ok(result)
    }
    /// 返回实际写入长度，调用者保留后缀；EOF 必须排在已排队输入之后。
    pub fn write_stdin(&mut self, bytes: &[u8]) -> Result<Option<usize>, NativeError> {
        if self.stdin_closed { return Err(NativeError::StdinClosed); }
        Ok(self.main.write(bytes)?)
    }
    pub fn close_stdin(&mut self) -> Result<(), NativeError> {
        if !self.stdin_closed { self.main.shutdown_write()?; self.stdin_closed = true; }
        Ok(())
    }
    /// BSD 信号是次连接上的普通单字节写入；不是宿主信号或 TCP urgent。
    pub fn send_signal(&mut self, signal: Signal) -> Result<Option<usize>, NativeError> {
        match self.secondary.write(&signal.encode())? {
            Some(0) => Err(SocketError::IoFailed.into()), result => Ok(result),
        }
    }
    pub fn output_complete(&self) -> bool { self.stdout_eof && self.stderr_eof }
    pub fn close(self) -> Result<(), NativeError> {
        let main = self.main.close();
        let secondary = self.secondary.close();
        main.and(secondary).map_err(Into::into)
    }
}
fn validate_buffer(buffer: &[u8]) -> Result<(), NativeError> {
    if buffer.is_empty() || buffer.len() > MAX_CHUNK { return Err(SocketError::InvalidChunk.into()); }
    Ok(())
}
#[cfg(test)] mod tests;
