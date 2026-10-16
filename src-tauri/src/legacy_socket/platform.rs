use std::io;
use std::net::TcpStream;
use super::Readiness;
#[cfg(unix)] use std::os::fd::AsRawFd;
#[cfg(windows)] use std::os::windows::io::AsRawSocket;
#[cfg(windows)] use windows_sys::Win32::Networking::WinSock::*;

#[cfg(unix)]
pub(super) fn oob_separate(stream: &TcpStream) -> io::Result<()> {
    let value = 0_i32;
    let result = unsafe { libc::setsockopt(stream.as_raw_fd(), libc::SOL_SOCKET, libc::SO_OOBINLINE,
        &value as *const _ as *const _, std::mem::size_of_val(&value) as _) };
    if result == 0 { Ok(()) } else { Err(io::Error::last_os_error()) }
}
#[cfg(unix)]
pub(super) fn readiness(stream: &TcpStream) -> io::Result<Readiness> {
    let priority = libc::POLLPRI | libc::POLLRDBAND;
    let mut descriptor = libc::pollfd { fd: stream.as_raw_fd(), events: libc::POLLIN | priority, revents: 0 };
    let result = unsafe { libc::poll(&mut descriptor, 1, 0) };
    if result < 0 {
        let error = io::Error::last_os_error();
        return if error.kind() == io::ErrorKind::Interrupted { Ok(Readiness::default()) } else { Err(error) };
    }
    if descriptor.revents & libc::POLLNVAL != 0 { return Err(io::Error::other("invalid owned socket")); }
    Ok(Readiness { readable: descriptor.revents & (libc::POLLIN | libc::POLLHUP | libc::POLLERR) != 0,
        urgent: descriptor.revents & priority != 0 })
}
#[cfg(unix)]
pub(super) fn urgent(stream: &TcpStream) -> io::Result<Option<u8>> {
    let mut byte = 0_u8;
    let count = unsafe { libc::recv(stream.as_raw_fd(), &mut byte as *mut _ as *mut _, 1, libc::MSG_OOB) };
    if count == 1 { return Ok(Some(byte)); }
    let error = io::Error::last_os_error();
    if count < 0 && matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) { Ok(None) }
    else { Err(if count == 0 { io::ErrorKind::UnexpectedEof.into() } else { error }) }
}
#[cfg(unix)]
pub(super) fn at_mark(stream: &TcpStream) -> io::Result<bool> {
    let mut marked = 0_i32;
    let result = unsafe { libc::ioctl(stream.as_raw_fd(), libc::SIOCATMARK as _, &mut marked) };
    if result == 0 { Ok(marked != 0) } else { Err(io::Error::last_os_error()) }
}
#[cfg(windows)] fn last_error() -> io::Error { io::Error::from_raw_os_error(unsafe { WSAGetLastError() }) }
#[cfg(windows)]
pub(super) fn exclusive(socket: &tokio::net::TcpSocket) -> io::Result<()> {
    let value = 1_i32;
    let result = unsafe { setsockopt(socket.as_raw_socket() as _, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
        &value as *const _ as *const u8, std::mem::size_of_val(&value) as _) };
    if result == 0 { Ok(()) } else { Err(last_error()) }
}
#[cfg(windows)]
pub(super) fn oob_separate(stream: &TcpStream) -> io::Result<()> {
    let value = 0_i32;
    let result = unsafe { setsockopt(stream.as_raw_socket() as _, SOL_SOCKET, SO_OOBINLINE,
        &value as *const _ as *const u8, std::mem::size_of_val(&value) as _) };
    if result == 0 { Ok(()) } else { Err(last_error()) }
}
#[cfg(windows)]
pub(super) fn readiness(stream: &TcpStream) -> io::Result<Readiness> {
    let mut read: FD_SET = unsafe { std::mem::zeroed() }; read.fd_count = 1; read.fd_array[0] = stream.as_raw_socket() as _;
    let mut urgent = read;
    let timeout = TIMEVAL { tv_sec: 0, tv_usec: 0 };
    let result = unsafe { select(0, &mut read, std::ptr::null_mut(), &mut urgent, &timeout) };
    if result < 0 { return Err(last_error()); }
    Ok(Readiness { readable: read.fd_count != 0, urgent: urgent.fd_count != 0 })
}
#[cfg(windows)]
pub(super) fn urgent(stream: &TcpStream) -> io::Result<Option<u8>> {
    let mut byte = 0_u8;
    let count = unsafe { recv(stream.as_raw_socket() as _, &mut byte, 1, MSG_OOB) };
    if count == 1 { return Ok(Some(byte)); }
    let error = last_error();
    if count < 0 && matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) { Ok(None) }
    else { Err(if count == 0 { io::ErrorKind::UnexpectedEof.into() } else { error }) }
}
#[cfg(windows)]
pub(super) fn at_mark(stream: &TcpStream) -> io::Result<bool> {
    let mut marked = 0_u32;
    let result = unsafe { ioctlsocket(stream.as_raw_socket() as _, SIOCATMARK as _, &mut marked) };
    if result == 0 { Ok(marked != 0) } else { Err(last_error()) }
}
#[cfg(all(test, unix))]
pub(super) fn send_urgent_fixture(stream: &TcpStream, byte: u8) -> io::Result<()> {
    let result = unsafe { libc::send(stream.as_raw_fd(), &byte as *const _ as *const _, 1, libc::MSG_OOB) };
    if result == 1 { Ok(()) } else { Err(io::Error::last_os_error()) }
}
#[cfg(all(test, windows))]
pub(super) fn send_urgent_fixture(stream: &TcpStream, byte: u8) -> io::Result<()> {
    let result = unsafe { send(stream.as_raw_socket() as _, &byte, 1, MSG_OOB) };
    if result == 1 { Ok(()) } else { Err(last_error()) }
}
