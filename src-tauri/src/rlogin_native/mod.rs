//! L1 原生接收/控制组件。握手由 rlogin_connect 接入，会话 owner/IPC/终端队列另行开发。
use crate::legacy_socket::{NativeSocket, SocketError, MAX_CHUNK};
use crate::rlogin::{window_size_frame, ProtocolError};
use std::{collections::VecDeque, time::{Duration, Instant}};
#[cfg(test)] mod tests;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlowMode { Local, Remote }
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Control { pub flush_output: bool, pub flow: FlowMode, pub window_frame: Option<[u8; 12]> }
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReceiveEvent { Idle, Closed, Data(usize), Control(Control) }
pub struct RloginReader {
    socket: NativeSocket, flow: FlowMode, paused: bool, flushing: bool, closed: bool,
    window_enabled: bool, window: [u8; 12],
    urgent_since: Option<Instant>, quarantined: VecDeque<u8>,
    pending_urgent: Option<u8>,
    failed: Option<SocketError>,
}
impl RloginReader {
    /// 仅用于已完成初始交换的所属 socket；rlogin_connect 将 ACK 尾部转入有界区。
    pub fn new(socket: NativeSocket, rows: u16, columns: u16, x_pixels: u16, y_pixels: u16) -> Result<Self, ProtocolError> {
        Ok(Self { socket, flow: FlowMode::Local, paused: false, flushing: false, closed: false,
            window_enabled: false, window: window_size_frame(rows, columns, x_pixels, y_pixels)?,
            urgent_since: None, quarantined: VecDeque::new(), pending_urgent: None, failed: None })
    }
    /// 建立 adapter 在交付 owner 前调用一次；ACK 合包尾部与后续 urgent 共用有界未渲染区。
    pub(crate) fn seed_initial(&mut self, bytes: &[u8]) -> Result<(), SocketError> {
        if bytes.len() > MAX_CHUNK - self.quarantined.len() { return Err(SocketError::UrgentBufferFull); }
        self.quarantined.extend(bytes); Ok(())
    }
    pub fn poll(&mut self, output: &mut [u8], has_capacity: bool) -> Result<ReceiveEvent, SocketError> {
        if output.is_empty() || output.len() > MAX_CHUNK { return Err(SocketError::InvalidChunk); }
        if let Some(error) = self.failed { return Err(error); }
        if self.closed { return Ok(ReceiveEvent::Closed); }
        let ready = self.socket.poll_ready()?;
        if self.pending_urgent.is_none() && (ready.urgent || self.urgent_since.is_some()) {
            let since = self.urgent_since.get_or_insert_with(Instant::now);
            if since.elapsed() >= Duration::from_secs(15) { return Err(SocketError::Timeout); }
            if let Some(bits) = self.socket.urgent(true)? {
                self.urgent_since = None;
                let flush = bits & 0x02 != 0;
                if flush && !NativeSocket::supports_urgent_boundary() {
                    let error = SocketError::UrgentBoundaryUnavailable;
                    self.failed = Some(error); return Err(error);
                }
                if NativeSocket::supports_urgent_boundary() { self.pending_urgent = Some(bits); }
                else {
                    let Some(actual) = self.socket.urgent(false)? else { return Ok(ReceiveEvent::Idle); };
                    if actual != bits { self.failed = Some(SocketError::IoFailed); return Err(SocketError::IoFailed); }
                }
                if bits & 0x10 != 0 { self.flow = FlowMode::Remote; self.paused = false; }
                if bits & 0x20 != 0 { self.flow = FlowMode::Local; }
                if flush { self.flushing = true; self.quarantined.clear(); }
                let window_frame = if bits & 0x80 != 0 { self.window_enabled = true; Some(self.window) } else { None };
                return Ok(ReceiveEvent::Control(Control { flush_output: flush, flow: self.flow, window_frame }));
            }
            // TCP 可以先通知 urgent 指针再收到控制字节；有界隔离前段数据让窗口继续推进。
            if ready.readable { self.hold_pre_mark()?; }
            return Ok(ReceiveEvent::Idle);
        }
        if let Some(expected) = self.pending_urgent {
            if self.socket.at_mark()? {
                // Unix 在普通 read 到达 mark 后消费 OOB，按已验证的位置语义结束前段。
                let Some(actual) = self.socket.urgent(false)? else { return Ok(ReceiveEvent::Idle); };
                if actual != expected { return Err(SocketError::IoFailed); }
                self.pending_urgent = None; self.flushing = false;
            } else if self.flushing {
                let mut discarded = [0_u8; 8192];
                return match self.socket.read(&mut discarded)? {
                    Some(0) => { self.closed = true; Ok(ReceiveEvent::Closed) },
                    _ => Ok(ReceiveEvent::Idle),
                };
            }
        }
        if !has_capacity || self.paused { return Ok(ReceiveEvent::Idle); }
        if !self.quarantined.is_empty() {
            let count = output.len().min(self.quarantined.len());
            for byte in &mut output[..count] { *byte = self.quarantined.pop_front().unwrap(); }
            return Ok(ReceiveEvent::Data(count));
        }
        if !ready.readable { return Ok(ReceiveEvent::Idle); }
        match self.socket.read(output)? {
            Some(0) => { self.closed = true; Ok(ReceiveEvent::Closed) },
            Some(count) => Ok(ReceiveEvent::Data(count)), None => Ok(ReceiveEvent::Idle),
        }
    }
    fn hold_pre_mark(&mut self) -> Result<(), SocketError> {
        let capacity = MAX_CHUNK - self.quarantined.len();
        if capacity == 0 { return Err(SocketError::UrgentBufferFull); }
        let mut buffer = [0_u8;8192]; let length = capacity.min(buffer.len());
        match self.socket.read(&mut buffer[..length])? {
            Some(0) => return Err(SocketError::IoFailed),
            Some(count) => self.quarantined.extend(&buffer[..count]), None => {},
        }
        Ok(())
    }
    pub fn input(&mut self, bytes: &[u8]) -> Result<Vec<u8>, SocketError> {
        if bytes.len() > MAX_CHUNK { return Err(SocketError::InvalidChunk); }
        let mut remote = Vec::with_capacity(bytes.len());
        for &byte in bytes {
            if self.flow == FlowMode::Local && matches!(byte, 0x11 | 0x13) { self.paused = byte == 0x13; }
            else { remote.push(byte); }
        }
        Ok(remote)
    }
    pub fn resize(&mut self, rows: u16, columns: u16, x_pixels: u16, y_pixels: u16) -> Result<Option<[u8;12]>, ProtocolError> {
        self.window = window_size_frame(rows, columns, x_pixels, y_pixels)?;
        Ok(self.window_enabled.then_some(self.window))
    }
    pub fn write(&mut self, bytes: &[u8]) -> Result<Option<usize>, SocketError> { self.socket.write(bytes) }
    pub fn close(self) -> Result<(), SocketError> { self.socket.close() }
}
