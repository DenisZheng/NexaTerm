use crate::{rlogin_connect::WindowSize, rlogin_session::{Ack, Phase, ReadReply, SessionError, SessionRequest, SessionStatus}};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WindowRequest {
    pub rows: u16, pub columns: u16,
    #[serde(default)] pub x_pixels: u16,
    #[serde(default)] pub y_pixels: u16,
}
impl WindowRequest {
    pub fn into_core(self) -> WindowSize { WindowSize {rows:self.rows,columns:self.columns,x_pixels:self.x_pixels,y_pixels:self.y_pixels} }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReserveRequest {
    pub local_address: String, pub target_address: String, pub port: u16,
    pub local_user: String, pub remote_user: String, pub terminal: String, pub speed: u32,
    pub window: WindowRequest, pub allow_plaintext: bool,
    #[serde(default = "utf8")]
    pub terminal_encoding: String,
}
fn utf8() -> String { "utf-8".into() }
impl ReserveRequest {
    pub fn into_core(self) -> Result<(SessionRequest, bool), SessionError> {
        let address = |s: &str| -> Result<Ipv4Addr, SessionError> { s.parse::<Ipv4Addr>().map_err(|_| crate::legacy_socket::SocketError::InvalidAddress.into()) };
        Ok((SessionRequest { local:address(&self.local_address)?, target:crate::rlogin_session::Destination::parse(&self.target_address,self.port)?,
            local_user:self.local_user,remote_user:self.remote_user,terminal:self.terminal,speed:self.speed,window:self.window.into_core(),
            terminal_encoding:self.terminal_encoding },self.allow_plaintext))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteRequest { pub reservation_id: String, pub data: Vec<u8> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteTextRequest { pub reservation_id: String, pub data: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ResizeRequest { pub reservation_id: String, pub window: WindowRequest }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AckDto { pub epoch: String, pub sequence: String }
impl AckDto {
    pub fn into_core(self) -> Result<Ack, SessionError> {
        let sequence = counter(&self.sequence)?;
        if sequence == 0 { return Err(SessionError::InvalidAck); }
        Ok(Ack {epoch:counter(&self.epoch)?,sequence})
    }
}
pub(super) fn counter(value: &str) -> Result<u64, SessionError> {
    crate::legacy_ipc::counter(value).ok_or(SessionError::InvalidAck)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadRequest { pub reservation_id: String, pub epoch: String, pub ack: Option<AckDto> }
#[derive(Serialize)]
pub(crate) struct FrameDto { pub epoch: String, pub sequence: String, pub data: Vec<u8> }
#[derive(Serialize)]
pub(crate) struct ReadReplyDto {
    pub epoch: String, pub phase: &'static str, pub reason: Option<&'static str>, pub requires_reset: bool,
    pub awaiting_ack: bool, pub finished: bool, pub frame: Option<FrameDto>,
}
#[derive(Serialize)]
pub(crate) struct StatusDto {
    pub epoch: String, pub phase: &'static str, pub reason: Option<&'static str>, pub awaiting_ack: bool, pub finished: bool,
}
fn phase(value: Phase) -> &'static str {
    match value { Phase::Reserved=>"reserved",Phase::Starting=>"starting",Phase::InitialExchangeReady=>"initial_exchange_ready",
        Phase::Closing=>"closing",Phase::Closed=>"closed",Phase::Failed=>"failed" }
}
impl From<ReadReply> for ReadReplyDto {
    fn from(r: ReadReply) -> Self {
        Self { epoch:r.epoch.to_string(),phase:phase(r.phase),reason:r.reason.map(SessionError::code),requires_reset:r.requires_reset,
            awaiting_ack:r.awaiting_ack,finished:r.finished,frame:r.frame.map(|f| FrameDto {epoch:f.epoch.to_string(),sequence:f.sequence.to_string(),data:f.data}) }
    }
}
impl From<SessionStatus> for StatusDto {
    fn from(s: SessionStatus) -> Self {
        Self {epoch:s.epoch.to_string(),phase:phase(s.phase),reason:s.reason.map(SessionError::code),awaiting_ack:s.awaiting_ack,finished:s.finished}
    }
}
