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
#[cfg(all(unix, not(target_os = "macos")))]
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
pub(super) fn urgent(stream: &TcpStream, peek: bool) -> io::Result<Option<u8>> {
    let mut byte = 0_u8;
    let flags = libc::MSG_OOB | if peek { libc::MSG_PEEK } else { 0 };
    let count = unsafe { libc::recv(stream.as_raw_fd(), &mut byte as *mut _ as *mut _, 1, flags) };
    if count == 1 { return Ok(Some(byte)); }
    let error = io::Error::last_os_error();
    if count < 0 && matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) { Ok(None) }
    else { Err(if count == 0 { io::ErrorKind::UnexpectedEof.into() } else { error }) }
}
#[cfg(unix)]
pub(super) fn at_mark(stream: &TcpStream) -> io::Result<bool> {
    // POSIX C ABI；锁定 libc 没有导出 Linux SIOCATMARK，避免硬编码 ioctl 编号。
    unsafe extern "C" { fn sockatmark(socket: libc::c_int) -> libc::c_int; }
    match unsafe { sockatmark(stream.as_raw_fd()) } {
        0 => Ok(false), 1 => Ok(true), _ => Err(io::Error::last_os_error()),
    }
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
pub(super) fn urgent(stream: &TcpStream, peek: bool) -> io::Result<Option<u8>> {
    let mut byte = 0_u8;
    let flags = MSG_OOB | if peek { MSG_PEEK } else { 0 };
    let count = unsafe { recv(stream.as_raw_socket() as _, &mut byte, 1, flags) };
    if count == 1 { return Ok(Some(byte)); }
    let error = last_error();
    if count < 0 && matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) { Ok(None) }
    else { Err(if count == 0 { io::ErrorKind::UnexpectedEof.into() } else { error }) }
}

#[cfg(target_os = "macos")]
pub(super) struct Monitor { fd: std::os::fd::OwnedFd, urgent: std::cell::Cell<bool> }
#[cfg(target_os = "macos")]
impl Monitor {
    pub fn new(stream: &TcpStream) -> io::Result<Self> {
        use std::os::fd::FromRawFd;
        let raw = unsafe { libc::kqueue() };
        if raw < 0 { return Err(io::Error::last_os_error()); }
        let owned = Self { fd: unsafe { std::os::fd::OwnedFd::from_raw_fd(raw) }, urgent: std::cell::Cell::new(false) };
        let mut changes: [libc::kevent;2] = unsafe { std::mem::zeroed() };
        for event in &mut changes { event.ident = stream.as_raw_fd() as _; event.flags = libc::EV_ADD | libc::EV_ENABLE; }
        changes[0].filter = libc::EVFILT_READ;
        changes[1].filter = libc::EVFILT_EXCEPT; changes[1].fflags = libc::NOTE_OOB;
        changes[1].flags |= libc::EV_CLEAR; // 清除已交付的 NOTE_OOB，避免消费后重复成为 urgent。
        let timeout = libc::timespec { tv_sec:0, tv_nsec:0 };
        let result = unsafe { libc::kevent(owned.fd.as_raw_fd(), changes.as_ptr(),2,std::ptr::null_mut(),0,&timeout) };
        if result < 0 { Err(io::Error::last_os_error()) } else { Ok(owned) }
    }
    pub fn readiness(&self) -> io::Result<Readiness> {
        let mut events: [libc::kevent;2] = unsafe { std::mem::zeroed() };
        let timeout = libc::timespec { tv_sec:0, tv_nsec:0 };
        let count = unsafe { libc::kevent(self.fd.as_raw_fd(),std::ptr::null(),0,events.as_mut_ptr(),2,&timeout) };
        if count < 0 { return Err(io::Error::last_os_error()); }
        let mut ready = Readiness { readable: false, urgent: self.urgent.get() };
        for event in &events[..count as usize] {
            if event.flags & libc::EV_ERROR != 0 && event.data != 0 { return Err(io::Error::from_raw_os_error(event.data as i32)); }
            if event.filter == libc::EVFILT_READ { ready.readable = true; }
            if event.filter == libc::EVFILT_EXCEPT && event.fflags & libc::NOTE_OOB != 0 {
                self.urgent.set(true); ready.urgent = true;
            }
        }
        Ok(ready)
    }
    pub fn consumed_urgent(&self) { self.urgent.set(false); }
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
#[cfg(test)]
pub(super) fn pending_bytes_fixture(stream: &TcpStream) -> io::Result<u32> {
    let mut count = 0_u32;
    #[cfg(windows)] let result = unsafe { ioctlsocket(stream.as_raw_socket() as _, FIONREAD as _, &mut count) };
    #[cfg(unix)] let result = unsafe { libc::ioctl(stream.as_raw_fd(), libc::FIONREAD as _, &mut count) };
    if result == 0 { Ok(count) } else {
        #[cfg(windows)] return Err(last_error());
        #[cfg(unix)] return Err(io::Error::last_os_error());
    }
}
#[cfg(all(test, windows))]
pub(super) fn inline_fixture(stream: &TcpStream) -> io::Result<()> {
    let value = 1_i32;
    let result = unsafe { setsockopt(stream.as_raw_socket() as _, SOL_SOCKET, SO_OOBINLINE,
        &value as *const _ as *const u8, std::mem::size_of_val(&value) as _) };
    if result == 0 { Ok(()) } else { Err(last_error()) }
}
