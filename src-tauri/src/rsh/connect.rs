//! 固定 IPv4 目标的实际双连接建立；尚不注册 IPC 或宣告命令入口可用。
use super::{encode_command, encode_secondary_port, validate_secondary_peer, Handshake, HandshakeProgress, ProtocolError, RshTransport};
use crate::legacy_socket::{bind_reserved, valid, NativeSocket, SocketError, CANCEL_POLL, CONNECT_TIMEOUT, MAX_CHUNK};
use std::{net::{Ipv4Addr, SocketAddrV4}, sync::atomic::{AtomicBool, Ordering}, time::Instant};
use tokio::net::TcpListener;
const MAX_INVALID_CALLBACKS: usize = 16;

pub struct ConnectOptions<'a> {
    pub local: Ipv4Addr,
    pub target: SocketAddrV4,
    pub local_user: &'a str,
    pub remote_user: &'a str,
    pub command: &'a [u8],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeError { Socket(SocketError), Protocol(ProtocolError), StdinClosed }
impl NativeError {
    pub fn code(self) -> &'static str { match self {
        Self::Socket(error) => error.code(), Self::Protocol(error) => error.code(), Self::StdinClosed => "rsh_stdin_closed",
    } }
}
impl std::fmt::Display for NativeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.code()) }
}
impl std::error::Error for NativeError {}
impl From<SocketError> for NativeError { fn from(error: SocketError) -> Self { Self::Socket(error) } }
impl From<ProtocolError> for NativeError { fn from(error: ProtocolError) -> Self { Self::Protocol(error) } }
impl ConnectOptions<'_> {
    fn prepare(&self) -> Result<Vec<u8>, NativeError> {
        if !valid(self.local) || !valid(*self.target.ip()) || self.target.port() == 0 { return Err(SocketError::InvalidAddress.into()); }
        Ok(encode_command(self.local_user, self.remote_user, self.command)?)
    }
}
pub async fn connect(options: ConnectOptions<'_>, cancel: &AtomicBool) -> Result<RshTransport, NativeError> {
    connect_until(options, cancel, Instant::now() + CONNECT_TIMEOUT).await
}
pub(crate) async fn connect_until(options: ConnectOptions<'_>, cancel: &AtomicBool, deadline: Instant) -> Result<RshTransport, NativeError> {
    let request = options.prepare()?;
    let deadline = deadline.min(Instant::now() + CONNECT_TIMEOUT);
    checkpoint(cancel, deadline)?;
    let listener = bind_reserved(options.local, cancel)?.listen()?;
    checkpoint(cancel, deadline)?;
    let main = bind_reserved(options.local, cancel)?;
    checkpoint(cancel, deadline)?;
    let main = main.connect_until(options.target, cancel, deadline).await?;
    establish(main, listener, *options.target.ip(), request, cancel, deadline).await
}
fn checkpoint(cancel: &AtomicBool, deadline: Instant) -> Result<(), NativeError> {
    if cancel.load(Ordering::Acquire) { return Err(SocketError::Cancelled.into()); }
    if Instant::now() >= deadline { return Err(SocketError::Timeout.into()); }
    Ok(())
}
async fn wait_progress(cancel: &AtomicBool, deadline: Instant) -> Result<(), NativeError> {
    checkpoint(cancel, deadline)?;
    tokio::time::sleep(deadline.saturating_duration_since(Instant::now()).min(CANCEL_POLL)).await;
    checkpoint(cancel, deadline)
}
async fn establish(mut main: NativeSocket, listener: TcpListener, expected: Ipv4Addr, request: Vec<u8>, cancel: &AtomicBool, deadline: Instant) -> Result<RshTransport, NativeError> {
    let port = listener.local_addr().map_err(|_| SocketError::IoFailed)?.port();
    let port = encode_secondary_port(port)?;
    let mut written = 0;
    while written < port.len() {
        checkpoint(cancel, deadline)?;
        match main.write(&port[written..])? {
            Some(0) => return Err(SocketError::IoFailed.into()), Some(count) => written += count,
            None => wait_progress(cancel, deadline).await?,
        }
    }
    let mut reply = Reply::new();
    let secondary = callback(&mut main, listener, expected, &mut reply, cancel, deadline).await?;
    exchange(main, secondary, request, reply, cancel, deadline).await
}
struct Reply { parser: Handshake, started: bool, rejecting: bool }
impl Reply {
    fn new() -> Self { Self { parser: Handshake::new(), started: false, rejecting: false } }
    fn read(&mut self, main: &mut NativeSocket, accept_allowed: bool) -> Result<Option<Vec<u8>>, NativeError> {
        let mut buffer = [0_u8; MAX_CHUNK];
        match main.read(&mut buffer)? {
            Some(0) => { self.parser.end_of_stream()?; Err(ProtocolError::UnexpectedEof.into()) },
            Some(count) => {
                if !self.started {
                    self.started = true;
                    if buffer[0] == 0 && !accept_allowed { return Err(ProtocolError::InvalidHandshake.into()); }
                    self.rejecting = buffer[0] != 0;
                }
                match self.parser.receive(&buffer[..count])? {
                    HandshakeProgress::Pending => Ok(None), HandshakeProgress::Accepted(tail) => Ok(Some(tail.to_vec())),
                }
            },
            None => Ok(None),
        }
    }
}
async fn callback(main: &mut NativeSocket, listener: TcpListener, expected: Ipv4Addr, reply: &mut Reply, cancel: &AtomicBool, deadline: Instant) -> Result<NativeSocket, NativeError> {
    let mut invalid = 0;
    loop {
        checkpoint(cancel, deadline)?;
        reply.read(main, false)?;
        if reply.rejecting { wait_progress(cancel, deadline).await?; continue; }
        let remaining = deadline.saturating_duration_since(Instant::now()).min(CANCEL_POLL);
        match tokio::time::timeout(remaining, listener.accept()).await {
            Ok(Ok((stream, peer))) => {
                checkpoint(cancel, deadline)?;
                if validate_secondary_peer(peer, expected).is_err() {
                    drop(stream); invalid += 1;
                    if invalid >= MAX_INVALID_CALLBACKS { return Err(ProtocolError::InvalidSecondaryPeer.into()); }
                    continue;
                }
                return Ok(NativeSocket::from_stream(stream.into_std().map_err(|_| SocketError::IoFailed)?)?);
            },
            Ok(Err(_)) => return Err(SocketError::IoFailed.into()), Err(_) => {},
        }
    }
}
async fn exchange(mut main: NativeSocket, secondary: NativeSocket, request: Vec<u8>, mut reply: Reply, cancel: &AtomicBool, deadline: Instant) -> Result<RshTransport, NativeError> {
    let mut written = 0;
    loop {
        checkpoint(cancel, deadline)?;
        // 拒绝首字节一到立即停止后续请求写入；不等待完整拒绝行才停止。
        if let Some(initial) = reply.read(&mut main, written == request.len())? {
            checkpoint(cancel, deadline)?;
            return Ok(RshTransport::new(main, secondary, initial));
        }
        if !reply.rejecting && written < request.len() {
            let end = (written + MAX_CHUNK).min(request.len());
            match main.write(&request[written..end])? {
                Some(0) => return Err(SocketError::IoFailed.into()), Some(count) => { written += count; continue; }, None => {},
            }
        }
        wait_progress(cancel, deadline).await?;
    }
}
#[cfg(test)] mod tests;
