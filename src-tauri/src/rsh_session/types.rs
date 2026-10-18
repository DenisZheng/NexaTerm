use crate::{legacy_dns::{Destination, ResolveError},legacy_session::LeaseError,legacy_socket::{valid,SocketError},legacy_text::{SessionEncoding,TextError},rsh::{self,ConnectOptions,NativeError}};
use std::net::{Ipv4Addr,SocketAddrV4};
/// All fields are transient; Debug deliberately excludes command, users and target.
pub struct TaskRequest {
    pub local:Ipv4Addr,pub target:Destination,pub local_user:String,pub remote_user:String,
    pub command:Vec<u8>,pub encoding:String,pub run_timeout_seconds:u32,
}
impl TaskRequest {
    pub(super) fn validate(&self)->Result<SessionEncoding,TaskError>{
        self.target.validate()?;
        if !valid(self.local){return Err(SocketError::InvalidAddress.into());}
        if self.run_timeout_seconds>86400{return Err(TaskError::InvalidTimeout);}
        rsh::encode_command(&self.local_user,&self.remote_user,&self.command).map_err(NativeError::from)?;
        SessionEncoding::new(&self.encoding).map_err(Into::into)
    }
    pub(super) fn options(&self,target:SocketAddrV4)->ConnectOptions<'_>{ConnectOptions{
        local:self.local,target,local_user:&self.local_user,remote_user:&self.remote_user,command:&self.command,
    }}
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum TaskError {Denied,ConsentRequired,Busy,Expired,Duplicate,InvalidChunk,InvalidAck,NotReady,Unavailable,
    InvalidEncoding,EncodingFailed,DnsFailed,DnsNoIpv4,InvalidTimeout,RunTimeout,StdinClosed,Native(NativeError)}
impl TaskError {pub fn code(self)->&'static str {match self {
    Self::Denied=>"rsh_task_denied",Self::ConsentRequired=>"rsh_task_consent_required",Self::Busy=>"rsh_task_busy",
    Self::Expired=>"rsh_task_expired",Self::Duplicate=>"rsh_task_duplicate",Self::InvalidChunk=>"rsh_task_invalid_chunk",
    Self::InvalidAck=>"rsh_task_invalid_ack",Self::NotReady=>"rsh_task_not_ready",Self::Unavailable=>"rsh_task_unavailable",
    Self::InvalidEncoding=>"rsh_encoding_invalid",Self::EncodingFailed=>"rsh_encoding_failed",Self::DnsFailed=>"rsh_dns_failed",
    Self::DnsNoIpv4=>"rsh_dns_no_ipv4",Self::InvalidTimeout=>"rsh_invalid_timeout",Self::RunTimeout=>"rsh_run_timeout",
    Self::StdinClosed=>"rsh_stdin_closed",Self::Native(error)=>error.code(),
}}}
impl std::fmt::Display for TaskError {fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{f.write_str(self.code())}}
impl std::error::Error for TaskError {}
impl From<NativeError> for TaskError {fn from(e:NativeError)->Self{Self::Native(e)}}
impl From<SocketError> for TaskError {fn from(e:SocketError)->Self{Self::Native(e.into())}}
impl From<ResolveError> for TaskError {fn from(e:ResolveError)->Self{match e{
    ResolveError::Socket(e)=>e.into(),ResolveError::Busy=>Self::Busy,ResolveError::Failed=>Self::DnsFailed,
    ResolveError::NoIpv4=>Self::DnsNoIpv4,ResolveError::Unavailable=>Self::Unavailable,
}}}
impl From<LeaseError> for TaskError {fn from(e:LeaseError)->Self{match e{
    LeaseError::Busy=>Self::Busy,LeaseError::Expired=>Self::Expired,LeaseError::Duplicate=>Self::Duplicate,LeaseError::Unavailable=>Self::Unavailable,
}}}
impl From<TextError> for TaskError {fn from(e:TextError)->Self{match e{
    TextError::InvalidEncoding=>Self::InvalidEncoding,TextError::EncodingFailed=>Self::EncodingFailed,TextError::InvalidChunk=>Self::InvalidChunk,
}}}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Phase {Reserved,Starting,InitialExchangeReady,Closing,Closed,Failed}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Stream {Stdout,Stderr}
impl Stream {pub(super) fn index(self)->usize{match self{Self::Stdout=>0,Self::Stderr=>1}}}
pub struct OutputFrame {pub sequence:u64,pub stream:Stream,pub data:Vec<u8>}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct TaskStatus {
    pub phase:Phase,pub reason:Option<TaskError>,pub stdin_eof:bool,pub stdout_eof:bool,pub stderr_eof:bool,
    pub awaiting_ack:bool,pub finished:bool,
}
pub struct ReadReply {pub status:TaskStatus,pub frame:Option<OutputFrame>}
