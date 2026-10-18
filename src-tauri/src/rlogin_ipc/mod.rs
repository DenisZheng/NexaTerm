//! 可由原生harness执行的IPC边界；实际窗口身份由Tauri wrapper传入。
mod dto;
#[cfg(test)] mod tests;
pub(crate) use dto::{AckDto, ReadReplyDto, ReadRequest, ReserveRequest, ResizeRequest, StatusDto, WriteRequest, WriteTextRequest};
use crate::{legacy_socket::{NativeSocket, SocketError}, rlogin_session::{SessionError, SessionManager}};
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct Capability {
    pub native_core: bool, pub exact_flush: bool, pub runtime_available: bool,
    pub terminal_available: bool, pub dns_available: bool, pub reason: Option<&'static str>,
}
pub(crate) fn capability(origin: &str) -> Result<Capability, SessionError> {
    require_main(origin)?; let exact = NativeSocket::supports_urgent_boundary();
    Ok(Capability {native_core:true,exact_flush:exact,runtime_available:exact,terminal_available:exact,dns_available:false,
        reason:(!exact).then_some(SocketError::UrgentBoundaryUnavailable.code())})
}
fn require_main(origin: &str) -> Result<(), SessionError> { if origin=="main" { Ok(()) } else { Err(SessionError::Denied) } }
fn io_available() -> Result<(), SessionError> {
    if NativeSocket::supports_urgent_boundary() { Ok(()) } else { Err(SocketError::UrgentBoundaryUnavailable.into()) }
}
fn id(value: &str) -> Result<(), SessionError> {
    if value.len()!=36 { return Err(SessionError::Expired); }
    let uuid = uuid::Uuid::try_parse(value).map_err(|_| SessionError::Expired)?;
    if uuid.get_version_num()!=4 || uuid.to_string()!=value { return Err(SessionError::Expired); }
    Ok(())
}
pub(crate) struct Boundary<'a> { manager: &'a SessionManager }
impl<'a> Boundary<'a> {
    pub fn new(actual_label: &str, manager: &'a SessionManager) -> Result<Self, SessionError> {
        require_main(actual_label)?; Ok(Self {manager})
    }
    pub fn reserve(&self, request: ReserveRequest) -> Result<String, SessionError> {
        io_available()?; let (request,consent)=request.into_core()?; self.manager.reserve("main",request,consent)
    }
    pub async fn start(&self, reservation_id: &str) -> Result<(), SessionError> {
        io_available()?; id(reservation_id)?; self.manager.start("main",reservation_id).await
    }
    pub fn write(&self, request: WriteRequest) -> Result<(), SessionError> {
        io_available()?; id(&request.reservation_id)?; self.manager.write("main",&request.reservation_id,&request.data)
    }
    pub fn write_text(&self, request: WriteTextRequest) -> Result<(), SessionError> {
        io_available()?; id(&request.reservation_id)?; self.manager.write_text("main",&request.reservation_id,&request.data)
    }
    pub fn resize(&self, request: ResizeRequest) -> Result<(), SessionError> {
        io_available()?; id(&request.reservation_id)?; self.manager.resize("main",&request.reservation_id,request.window.into_core())
    }
    pub fn read(&self, request: ReadRequest) -> Result<ReadReplyDto, SessionError> {
        io_available()?; id(&request.reservation_id)?; let epoch=dto::counter(&request.epoch)?;
        let ack=request.ack.map(AckDto::into_core).transpose()?;
        self.manager.read("main",&request.reservation_id,epoch,ack).map(Into::into)
    }
    pub fn status(&self, reservation_id: &str) -> Result<StatusDto, SessionError> {
        id(reservation_id)?; self.manager.status("main",reservation_id).map(Into::into)
    }
    pub fn cancel(&self, reservation_id: &str) -> Result<(), SessionError> {
        id(reservation_id)?; self.manager.cancel("main",reservation_id)
    }
    pub async fn close(&self, reservation_id: &str) -> Result<(), SessionError> {
        id(reservation_id)?; self.manager.close("main",reservation_id).await
    }
}
