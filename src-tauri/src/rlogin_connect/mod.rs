//! 原生初始交换；不注册 IPC，也不把 ACK 推断为认证或登录成功。
use crate::legacy_socket::{bind_reserved, valid, NativeSocket, SocketError, CANCEL_POLL, CONNECT_TIMEOUT, MAX_CHUNK};
use crate::rlogin::{encode_request, window_size_frame, Handshake, HandshakeProgress, ProtocolError};
use crate::rlogin_native::RloginReader;
use std::{net::{Ipv4Addr, SocketAddrV4}, sync::atomic::{AtomicBool, Ordering}, time::Instant};
#[cfg(test)] mod tests;

pub const BSD_USER_BYTES: usize = 30;
pub const BSD_TERMINAL_SPEED_BYTES: usize = 58;
#[derive(Clone, Copy)]
pub struct WindowSize { pub rows: u16, pub columns: u16, pub x_pixels: u16, pub y_pixels: u16 }
pub struct ConnectOptions<'a> {
    pub local: Ipv4Addr, pub target: SocketAddrV4,
    pub local_user: &'a str, pub remote_user: &'a str, pub terminal: &'a str, pub speed: u32,
    pub window: WindowSize,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectError { Socket(SocketError), Protocol(ProtocolError) }
impl ConnectError {
    pub fn code(self) -> &'static str { match self { Self::Socket(error) => error.code(), Self::Protocol(error) => error.code() } }
}
impl std::fmt::Display for ConnectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.code()) }
}
impl std::error::Error for ConnectError {}
impl From<SocketError> for ConnectError { fn from(error: SocketError) -> Self { Self::Socket(error) } }
impl From<ProtocolError> for ConnectError { fn from(error: ProtocolError) -> Self { Self::Protocol(error) } }
struct Prepared { request: Vec<u8>, window: WindowSize }
impl ConnectOptions<'_> {
    fn prepare(&self) -> Result<Prepared, ConnectError> {
        let request = encode_request(self.local_user, self.remote_user, self.terminal, self.speed)?;
        if [self.local_user, self.remote_user].iter().any(|user| user.len() > BSD_USER_BYTES) {
            return Err(ProtocolError::InvalidUser.into());
        }
        if self.terminal.len() + 1 + self.speed.to_string().len() > BSD_TERMINAL_SPEED_BYTES {
            return Err(ProtocolError::InvalidTerminal.into());
        }
        let w = self.window; window_size_frame(w.rows, w.columns, w.x_pixels, w.y_pixels)?;
        if !valid(self.local) || !valid(*self.target.ip()) || self.target.port() == 0 {
            return Err(SocketError::InvalidAddress.into());
        }
        Ok(Prepared { request, window: w })
    }
}
pub async fn connect(options: ConnectOptions<'_>, cancel: &AtomicBool) -> Result<RloginReader, ConnectError> {
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    let prepared = options.prepare()?;
    checkpoint(cancel, deadline)?;
    let socket = bind_reserved(options.local, cancel)?;
    // 同步 bind 扫描有界，但不假称 OS 调用可被异步取消；返回后沿用原总截止。
    checkpoint(cancel, deadline)?;
    let socket = socket.connect_until(options.target, cancel, deadline).await?;
    exchange(socket, prepared, cancel, deadline).await
}
fn checkpoint(cancel: &AtomicBool, deadline: Instant) -> Result<(), ConnectError> {
    if cancel.load(Ordering::Acquire) { return Err(SocketError::Cancelled.into()); }
    if Instant::now() >= deadline { return Err(SocketError::Timeout.into()); }
    Ok(())
}
async fn wait_progress(cancel: &AtomicBool, deadline: Instant) -> Result<(), ConnectError> {
    checkpoint(cancel, deadline)?;
    tokio::time::sleep(deadline.saturating_duration_since(Instant::now()).min(CANCEL_POLL)).await;
    checkpoint(cancel, deadline)
}
async fn exchange(mut socket: NativeSocket, prepared: Prepared, cancel: &AtomicBool, deadline: Instant) -> Result<RloginReader, ConnectError> {
    let mut written = 0;
    while written < prepared.request.len() {
        checkpoint(cancel, deadline)?;
        match socket.write(&prepared.request[written..])? {
            Some(0) => return Err(SocketError::IoFailed.into()),
            Some(count) => written += count,
            None => wait_progress(cancel, deadline).await?,
        }
    }
    let mut handshake = Handshake::new(); let mut buffer = [0_u8; MAX_CHUNK];
    loop {
        checkpoint(cancel, deadline)?;
        match socket.read(&mut buffer)? {
            Some(0) => { handshake.end_of_stream()?; return Err(ProtocolError::UnexpectedEof.into()); },
            Some(count) => match handshake.receive(&buffer[..count])? {
                HandshakeProgress::Pending => {},
                HandshakeProgress::Accepted(tail) => {
                    checkpoint(cancel, deadline)?;
                    let w = prepared.window;
                    let mut reader = RloginReader::new(socket, w.rows, w.columns, w.x_pixels, w.y_pixels)?;
                    reader.seed_initial(tail)?; return Ok(reader);
                },
            },
            None => wait_progress(cancel, deadline).await?,
        }
    }
}
