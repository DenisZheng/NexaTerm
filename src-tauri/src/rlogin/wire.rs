pub const DEFAULT_PORT: u16 = 513;
pub const MAX_USER_BYTES: usize = 256;
pub const MAX_TERMINAL_BYTES: usize = 64;
pub const MAX_REJECTION_BYTES: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolError {
    InvalidUser, InvalidTerminal, InvalidSpeed, InvalidWindow,
    Rejected, RejectionTooLong, UnexpectedEof, AlreadyFinished,
}
impl ProtocolError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidUser => "rlogin_invalid_user",
            Self::InvalidTerminal => "rlogin_invalid_terminal",
            Self::InvalidSpeed => "rlogin_invalid_speed",
            Self::InvalidWindow => "rlogin_invalid_window",
            Self::Rejected => "rlogin_rejected",
            Self::RejectionTooLong => "rlogin_rejection_too_long",
            Self::UnexpectedEof => "rlogin_unexpected_eof",
            Self::AlreadyFinished => "rlogin_already_finished",
        }
    }
}
impl std::fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.code()) }
}
impl std::error::Error for ProtocolError {}

pub fn encode_request(local_user: &str, remote_user: &str, terminal: &str, speed: u32) -> Result<Vec<u8>, ProtocolError> {
    for user in [local_user, remote_user] {
        if user.is_empty() || user.len() > MAX_USER_BYTES || user.chars().any(char::is_control) {
            return Err(ProtocolError::InvalidUser);
        }
    }
    if terminal.is_empty() || terminal.len() > MAX_TERMINAL_BYTES
        || !terminal.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'+' | b'-')) {
        return Err(ProtocolError::InvalidTerminal);
    }
    if speed == 0 { return Err(ProtocolError::InvalidSpeed); }
    let terminal_speed = format!("{terminal}/{speed}");
    let mut request = Vec::with_capacity(4 + local_user.len() + remote_user.len() + terminal_speed.len());
    request.push(0);
    for field in [local_user, remote_user, &terminal_speed] {
        request.extend_from_slice(field.as_bytes()); request.push(0);
    }
    Ok(request)
}

enum State { Awaiting, Rejecting(usize), Accepted, Failed(ProtocolError) }
pub struct Handshake { state: State }
#[derive(Debug, PartialEq, Eq)]
pub enum HandshakeProgress<'a> {
    Pending,
    /// 仅确认初始交换；尾部是原样数据，不证明认证或登录成功。
    Accepted(&'a [u8]),
}
impl Default for Handshake { fn default() -> Self { Self::new() } }
impl Handshake {
    pub fn new() -> Self { Self { state: State::Awaiting } }
    pub fn receive<'a>(&mut self, bytes: &'a [u8]) -> Result<HandshakeProgress<'a>, ProtocolError> {
        let mut remaining = bytes;
        match self.state {
            State::Failed(error) => return Err(error),
            State::Accepted => return Err(ProtocolError::AlreadyFinished),
            State::Awaiting => {
                let Some((&status, tail)) = bytes.split_first() else { return Ok(HandshakeProgress::Pending); };
                if status == 0 {
                    self.state = State::Accepted; return Ok(HandshakeProgress::Accepted(tail));
                }
                self.state = State::Rejecting(0); remaining = tail;
            }
            State::Rejecting(_) => {},
        }
        for &byte in remaining {
            if byte == b'\n' { return self.fail(ProtocolError::Rejected); }
            if let State::Rejecting(count) = &mut self.state {
                if *count == MAX_REJECTION_BYTES { return self.fail(ProtocolError::RejectionTooLong); }
                *count += 1;
            }
        }
        Ok(HandshakeProgress::Pending)
    }
    pub fn end_of_stream(&mut self) -> Result<(), ProtocolError> {
        let error = match self.state {
            State::Accepted => return Ok(()),
            State::Awaiting => ProtocolError::UnexpectedEof,
            State::Rejecting(_) => ProtocolError::Rejected,
            State::Failed(error) => error,
        };
        self.fail(error)
    }
    fn fail<T>(&mut self, error: ProtocolError) -> Result<T, ProtocolError> {
        self.state = State::Failed(error); Err(error)
    }
}

pub fn window_size_frame(rows: u16, columns: u16, x_pixels: u16, y_pixels: u16) -> Result<[u8; 12], ProtocolError> {
    if rows == 0 || columns == 0 { return Err(ProtocolError::InvalidWindow); }
    let mut frame = [0_u8; 12]; frame[..4].copy_from_slice(&[255, 255, b's', b's']);
    for (field, value) in frame[4..].chunks_exact_mut(2).zip([rows, columns, x_pixels, y_pixels]) {
        field.copy_from_slice(&value.to_be_bytes());
    }
    Ok(frame)
}
