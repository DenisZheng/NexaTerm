//! Rlogin/Rsh 共用的原生 socket 基础；不注册 IPC 或声明协议已可用。
use std::future::Future;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, SocketAddrV4, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpSocket};
mod platform;
#[cfg(test)] mod tests;
#[cfg(test)] pub(crate) mod fixture;
pub const MAX_CHUNK: usize = 32 * 1024;
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
pub(crate) const CANCEL_POLL: Duration = Duration::from_millis(25);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketError { InvalidAddress, InvalidChunk, UrgentBufferFull, UrgentBoundaryUnavailable, AccessDenied, PortsBusy, PortsUnavailable,
    Unavailable, ConnectFailed, Timeout, Cancelled, IoFailed }
impl SocketError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidAddress => "legacy_socket_invalid_address", Self::InvalidChunk => "legacy_socket_invalid_chunk",
            Self::UrgentBufferFull => "legacy_socket_urgent_buffer_full",
            Self::UrgentBoundaryUnavailable => "legacy_socket_urgent_boundary_unavailable",
            Self::AccessDenied => "legacy_socket_access_denied", Self::PortsBusy => "legacy_socket_ports_busy",
            Self::PortsUnavailable => "legacy_socket_ports_unavailable", Self::Unavailable => "legacy_socket_unavailable",
            Self::ConnectFailed => "legacy_socket_connect_failed", Self::Timeout => "legacy_socket_timeout",
            Self::Cancelled => "legacy_socket_cancelled", Self::IoFailed => "legacy_socket_io_failed",
        }
    }
}
impl std::fmt::Display for SocketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.code()) }
}
impl std::error::Error for SocketError {}
pub(crate) fn valid(address: Ipv4Addr) -> bool { !address.is_unspecified() && !address.is_multicast() && !address.is_broadcast() }
pub struct ReservedSocket(TcpSocket);
impl std::fmt::Debug for ReservedSocket {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str("ReservedSocket{..}") }
}
pub fn bind_reserved(local: Ipv4Addr, cancel: &AtomicBool) -> Result<ReservedSocket, SocketError> {
    if !valid(local) { return Err(SocketError::InvalidAddress); }
    choose_port(cancel, |port| {
        let socket = TcpSocket::new_v4()?;
        socket.set_reuseaddr(false)?;
        #[cfg(windows)] platform::exclusive(&socket)?;
        socket.bind(SocketAddrV4::new(local, port).into())?;
        Ok(ReservedSocket(socket))
    })
}
fn choose_port<T>(cancel: &AtomicBool, mut bind: impl FnMut(u16) -> io::Result<T>) -> Result<T, SocketError> {
    let mut denied = 0; let mut busy = 0;
    for port in (512..=1023).rev() {
        if cancel.load(Ordering::Acquire) { return Err(SocketError::Cancelled); }
        match bind(port) {
            Ok(socket) => return Ok(socket),
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => denied += 1,
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => busy += 1,
            Err(_) => return Err(SocketError::Unavailable),
        }
    }
    Err(if denied == 512 { SocketError::AccessDenied } else if busy == 512 { SocketError::PortsBusy } else { SocketError::PortsUnavailable })
}
impl ReservedSocket {
    pub fn local_addr(&self) -> Result<SocketAddr, SocketError> { self.0.local_addr().map_err(|_| SocketError::IoFailed) }
    pub async fn connect(self, target: SocketAddrV4, cancel: &AtomicBool) -> Result<NativeSocket, SocketError> {
        self.connect_until(target, cancel, Instant::now() + CONNECT_TIMEOUT).await
    }
    pub(crate) async fn connect_until(self, target: SocketAddrV4, cancel: &AtomicBool, deadline: Instant) -> Result<NativeSocket, SocketError> {
        if !valid(*target.ip()) || target.port() == 0 { return Err(SocketError::InvalidAddress); }
        let deadline = deadline.min(Instant::now() + CONNECT_TIMEOUT);
        let stream = wait_connect(self.0.connect(target.into()), cancel, deadline).await?;
        if cancel.load(Ordering::Acquire) { return Err(SocketError::Cancelled); }
        NativeSocket::from_stream(stream.into_std().map_err(|_| SocketError::IoFailed)?)
    }
    pub fn listen(self) -> Result<TcpListener, SocketError> { self.0.listen(1).map_err(|_| SocketError::IoFailed) }
}
async fn wait_connect<T>(future: impl Future<Output = io::Result<T>>, cancel: &AtomicBool, deadline: Instant) -> Result<T, SocketError> {
    let mut future = std::pin::pin!(future);
    loop {
        if cancel.load(Ordering::Acquire) { return Err(SocketError::Cancelled); }
        let remaining = deadline.checked_duration_since(Instant::now()).filter(|d| !d.is_zero()).ok_or(SocketError::Timeout)?;
        match tokio::time::timeout(remaining.min(CANCEL_POLL), future.as_mut()).await {
            Ok(Ok(value)) => return Ok(value), Ok(Err(_)) => return Err(SocketError::ConnectFailed), Err(_) => {},
        }
    }
}
#[derive(Default, Clone, Copy, Debug)]
pub struct Readiness { pub readable: bool, pub urgent: bool }
pub struct NativeSocket {
    stream: TcpStream,
    #[cfg(target_os = "macos")] monitor: platform::Monitor,
}
impl std::fmt::Debug for NativeSocket {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str("NativeSocket{..}") }
}
impl NativeSocket {
    /// 当前 Unix 实现具有已验证的位置语义；不把 Windows 的 OOB 队列状态冒充位置。
    pub const fn supports_urgent_boundary() -> bool { cfg!(unix) }
    pub fn from_stream(stream: TcpStream) -> Result<Self, SocketError> {
        stream.set_nonblocking(true).map_err(|_| SocketError::IoFailed)?;
        platform::oob_separate(&stream).map_err(|_| SocketError::IoFailed)?;
        #[cfg(target_os = "macos")] let monitor = platform::Monitor::new(&stream).map_err(|_| SocketError::IoFailed)?;
        Ok(Self { stream, #[cfg(target_os = "macos")] monitor })
    }
    pub fn local_addr(&self) -> Result<SocketAddr, SocketError> { self.stream.local_addr().map_err(|_| SocketError::IoFailed) }
    pub fn peer_addr(&self) -> Result<SocketAddr, SocketError> { self.stream.peer_addr().map_err(|_| SocketError::IoFailed) }
    pub fn poll_ready(&self) -> Result<Readiness, SocketError> {
        #[cfg(target_os = "macos")] let ready = self.monitor.readiness();
        #[cfg(not(target_os = "macos"))] let ready = platform::readiness(&self.stream);
        ready.map_err(|_| SocketError::IoFailed)
    }
    pub(crate) fn urgent(&self, peek: bool) -> Result<Option<u8>, SocketError> { platform::urgent(&self.stream, peek).map_err(|_| SocketError::IoFailed) }
    pub(crate) fn at_mark(&self) -> Result<bool, SocketError> { platform::at_mark(&self.stream).map_err(|_| SocketError::IoFailed) }
    pub fn read(&mut self, buffer: &mut [u8]) -> Result<Option<usize>, SocketError> {
        if buffer.is_empty() || buffer.len() > MAX_CHUNK { return Err(SocketError::InvalidChunk); }
        progress(self.stream.read(buffer))
    }
    /// 返回真实写入长度；调用方必须保留未写后缀并按顺序重试。
    pub fn write(&mut self, bytes: &[u8]) -> Result<Option<usize>, SocketError> {
        if bytes.len() > MAX_CHUNK { return Err(SocketError::InvalidChunk); }
        progress(self.stream.write(bytes))
    }
    pub fn close(self) -> Result<(), SocketError> {
        match self.stream.shutdown(Shutdown::Both) {
            Ok(()) => Ok(()), Err(error) if error.kind() == io::ErrorKind::NotConnected => Ok(()), Err(_) => Err(SocketError::IoFailed),
        }
    }
}
fn progress(result: io::Result<usize>) -> Result<Option<usize>, SocketError> {
    match result {
        Ok(count) => Ok(Some(count)),
        Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => Ok(None),
        Err(_) => Err(SocketError::IoFailed),
    }
}
#[cfg(test)] pub(crate) fn send_urgent_fixture(stream: &TcpStream, byte: u8) { platform::send_urgent_fixture(stream, byte).unwrap(); }
