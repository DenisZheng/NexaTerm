use crate::legacy_socket::SocketError;
use crate::rlogin_connect::{ConnectError, ConnectOptions, WindowSize};
use std::net::{Ipv4Addr, SocketAddrV4};

pub struct SessionRequest {
    pub local: Ipv4Addr, pub target: SocketAddrV4,
    pub local_user: String, pub remote_user: String, pub terminal: String, pub speed: u32, pub window: WindowSize,
    pub terminal_encoding: String,
}
impl SessionRequest {
    pub(super) fn options(&self) -> ConnectOptions<'_> {
        ConnectOptions { local: self.local, target: self.target, local_user: &self.local_user,
            remote_user: &self.remote_user, terminal: &self.terminal, speed: self.speed, window: self.window }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionError { Denied, ConsentRequired, Busy, Expired, Duplicate, InvalidChunk, InvalidAck, NotReady, Unavailable,
    InvalidEncoding, EncodingFailed, Connect(ConnectError) }
impl SessionError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Denied => "rlogin_session_denied", Self::ConsentRequired => "rlogin_session_consent_required",
            Self::Busy => "rlogin_session_busy", Self::Expired => "rlogin_session_expired", Self::Duplicate => "rlogin_session_duplicate",
            Self::InvalidChunk => "rlogin_session_invalid_chunk", Self::InvalidAck => "rlogin_session_invalid_ack",
            Self::NotReady => "rlogin_session_not_ready", Self::Unavailable => "rlogin_session_unavailable",
            Self::InvalidEncoding => "rlogin_encoding_invalid", Self::EncodingFailed => "rlogin_encoding_failed",
            Self::Connect(error) => error.code(),
        }
    }
}
impl std::fmt::Display for SessionError { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.code()) } }
impl std::error::Error for SessionError {}
impl From<SocketError> for SessionError { fn from(error: SocketError) -> Self { Self::Connect(ConnectError::Socket(error)) } }
impl From<ConnectError> for SessionError { fn from(error: ConnectError) -> Self { Self::Connect(error) } }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Reserved, Starting, InitialExchangeReady, Closing, Closed, Failed }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ack { pub epoch: u64, pub sequence: u64 }
pub struct OutputFrame { pub epoch: u64, pub sequence: u64, pub data: Vec<u8> }
pub struct ReadReply {
    pub epoch: u64, pub phase: Phase, pub reason: Option<SessionError>, pub requires_reset: bool,
    pub awaiting_ack: bool, pub finished: bool, pub frame: Option<OutputFrame>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SessionStatus {
    pub epoch: u64, pub phase: Phase, pub reason: Option<SessionError>, pub awaiting_ack: bool, pub finished: bool,
}
