//! BSD wire/profile core. No external client, IPC, local execution or exit-code claim.
use std::net::{Ipv4Addr, SocketAddr};
pub const DEFAULT_PORT: u16 = 514;
pub const MAX_USER_BYTES: usize = 16;
pub const MAX_COMMAND_BYTES: usize = 64 * 1024;
pub use crate::rlogin::{HandshakeProgress, MAX_REJECTION_BYTES};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolError { InvalidUser, InvalidCommand, InvalidSecondaryPort, InvalidSecondaryPeer,
    Rejected, RejectionTooLong, UnexpectedEof, AlreadyFinished, InvalidHandshake }
impl ProtocolError {
    pub fn code(self)->&'static str { match self {
        Self::InvalidUser=>"rsh_invalid_user",Self::InvalidCommand=>"rsh_invalid_command",
        Self::InvalidSecondaryPort=>"rsh_invalid_secondary_port",Self::InvalidSecondaryPeer=>"rsh_invalid_secondary_peer",
        Self::Rejected=>"rsh_rejected",Self::RejectionTooLong=>"rsh_rejection_too_long",
        Self::UnexpectedEof=>"rsh_unexpected_eof",Self::AlreadyFinished=>"rsh_already_finished",Self::InvalidHandshake=>"rsh_invalid_handshake",
    } }
}
impl std::fmt::Display for ProtocolError { fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result { f.write_str(self.code()) } }
impl std::error::Error for ProtocolError {}
fn reserved(port:u16)->bool { (512..=1023).contains(&port) }
pub fn encode_secondary_port(port:u16)->Result<Vec<u8>,ProtocolError> {
    if !reserved(port) { return Err(ProtocolError::InvalidSecondaryPort); }
    let mut bytes=port.to_string().into_bytes();bytes.push(0);Ok(bytes)
}
pub fn encode_command(local_user:&str,remote_user:&str,command:&[u8])->Result<Vec<u8>,ProtocolError> {
    for user in [local_user,remote_user] {
        if user.is_empty() || user.len()>MAX_USER_BYTES || user.chars().any(char::is_control) { return Err(ProtocolError::InvalidUser); }
    }
    if command.is_empty() || command.len()>MAX_COMMAND_BYTES || command.contains(&0) { return Err(ProtocolError::InvalidCommand); }
    let mut bytes=Vec::with_capacity(local_user.len()+remote_user.len()+command.len()+3);
    bytes.extend_from_slice(local_user.as_bytes());bytes.push(0);bytes.extend_from_slice(remote_user.as_bytes());bytes.push(0);
    bytes.extend_from_slice(command);bytes.push(0);Ok(bytes)
}
pub fn validate_secondary_peer(peer:SocketAddr,expected:Ipv4Addr)->Result<(),ProtocolError> {
    if !crate::legacy_socket::valid(expected) { return Err(ProtocolError::InvalidSecondaryPeer); }
    match peer { SocketAddr::V4(peer) if *peer.ip()==expected && reserved(peer.port())=>Ok(()),_=>Err(ProtocolError::InvalidSecondaryPeer) }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Signal { Hangup, Interrupt, Quit, Kill, Terminate }
impl Signal { pub fn encode(self)->[u8;1] { [match self { Self::Hangup=>1,Self::Interrupt=>2,Self::Quit=>3,Self::Kill=>9,Self::Terminate=>15 }] } }
fn reason(error:crate::rlogin::ProtocolError)->ProtocolError {
    use crate::rlogin::ProtocolError as Shared;
    match error { Shared::Rejected=>ProtocolError::Rejected,Shared::RejectionTooLong=>ProtocolError::RejectionTooLong,
        Shared::UnexpectedEof=>ProtocolError::UnexpectedEof,Shared::AlreadyFinished=>ProtocolError::AlreadyFinished,_=>ProtocolError::InvalidHandshake }
}
pub struct Handshake(crate::rlogin::Handshake);
impl Default for Handshake { fn default()->Self { Self::new() } }
impl Handshake {
    pub fn new()->Self { Self(crate::rlogin::Handshake::new()) }
    pub fn receive<'a>(&mut self,bytes:&'a [u8])->Result<HandshakeProgress<'a>,ProtocolError> { self.0.receive(bytes).map_err(reason) }
    pub fn end_of_stream(&mut self)->Result<(),ProtocolError> { self.0.end_of_stream().map_err(reason) }
}
#[cfg(test)] mod tests;
