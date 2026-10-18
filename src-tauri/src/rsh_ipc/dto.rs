use crate::{legacy_dns::Destination,legacy_text::SessionEncoding,rsh::{MAX_COMMAND_BYTES,Signal},rsh_session::{TaskError,TaskRequest,Phase,Stream,TaskStatus,ReadReply}};
use serde::{Deserialize,Serialize};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReserveRequest {
    pub local_address:String,pub target_address:String,pub port:u16,pub local_user:String,pub remote_user:String,
    pub command:String,pub encoding:String,pub run_timeout_seconds:u32,pub allow_plaintext:bool,
}
impl ReserveRequest {
    pub fn into_core(self)->Result<TaskRequest,TaskError>{
        if !self.allow_plaintext{return Err(TaskError::ConsentRequired);}
        let encoding=SessionEncoding::new(&self.encoding)?;
        let command=encoding.encode_limited(&self.command,MAX_COMMAND_BYTES,MAX_COMMAND_BYTES)?;
        Ok(TaskRequest{local:self.local_address.parse().map_err(|_|crate::legacy_socket::SocketError::InvalidAddress)?,
            target:Destination::parse(&self.target_address,self.port)?,local_user:self.local_user,remote_user:self.remote_user,
            command,encoding:self.encoding,run_timeout_seconds:self.run_timeout_seconds})
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteRequest {pub reservation_id:String,pub data:Vec<u8>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WriteTextRequest {pub reservation_id:String,pub data:String}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadRequest {pub reservation_id:String,pub ack:Option<String>}
#[derive(Deserialize)]
#[serde(rename_all="snake_case")]
pub(crate) enum SignalDto {Hangup,Interrupt,Quit,Kill,Terminate}
impl From<SignalDto> for Signal {fn from(s:SignalDto)->Self{match s{
    SignalDto::Hangup=>Self::Hangup,SignalDto::Interrupt=>Self::Interrupt,SignalDto::Quit=>Self::Quit,SignalDto::Kill=>Self::Kill,SignalDto::Terminate=>Self::Terminate,
}}}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SignalRequest {pub reservation_id:String,pub signal:SignalDto}
#[derive(Serialize)]
pub(crate) struct StatusDto {pub phase:&'static str,pub reason:Option<&'static str>,pub stdin_eof:bool,pub stdout_eof:bool,
    pub stderr_eof:bool,pub awaiting_ack:bool,pub finished:bool,pub remote_exit_code:Option<i32>}
#[derive(Serialize)]
pub(crate) struct FrameDto {pub sequence:String,pub stream:&'static str,pub data:Vec<u8>}
#[derive(Serialize)]
pub(crate) struct ReadReplyDto {pub status:StatusDto,pub frame:Option<FrameDto>}
impl From<TaskStatus> for StatusDto {fn from(s:TaskStatus)->Self{Self{
    phase:match s.phase{Phase::Reserved=>"reserved",Phase::Starting=>"starting",Phase::InitialExchangeReady=>"initial_exchange_ready",
        Phase::Closing=>"closing",Phase::Closed=>"closed",Phase::Failed=>"failed"},
    reason:s.reason.map(TaskError::code),stdin_eof:s.stdin_eof,stdout_eof:s.stdout_eof,stderr_eof:s.stderr_eof,
    awaiting_ack:s.awaiting_ack,finished:s.finished,remote_exit_code:None,
}}}
impl From<ReadReply> for ReadReplyDto {fn from(r:ReadReply)->Self{Self{status:r.status.into(),frame:r.frame.map(|f|FrameDto{
    sequence:f.sequence.to_string(),stream:match f.stream{Stream::Stdout=>"stdout",Stream::Stderr=>"stderr"},data:f.data,
})}}}
