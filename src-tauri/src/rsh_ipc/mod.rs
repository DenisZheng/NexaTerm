//! IPC validation runs without a WebView; wrappers supply the actual window label.
mod dto;
#[cfg(test)] mod tests;
pub(crate) use dto::{ReserveRequest,WriteRequest,WriteTextRequest,ReadRequest,ReadReplyDto,StatusDto,SignalRequest};
use crate::rsh_session::{TaskError,TaskManager};
use serde::Serialize;
#[derive(Serialize)]
pub(crate) struct Capability {pub native_core:bool,pub runtime_available:bool,pub dns_available:bool,pub reserved_ports_required:bool}
pub(crate) fn capability(origin:&str)->Result<Capability,TaskError>{require_main(origin)?;Ok(Capability{
    native_core:true,runtime_available:true,dns_available:true,reserved_ports_required:true,
})}
fn require_main(origin:&str)->Result<(),TaskError>{if origin=="main"{Ok(())}else{Err(TaskError::Denied)}}
fn id(value:&str)->Result<(),TaskError>{if crate::legacy_ipc::id(value){Ok(())}else{Err(TaskError::Expired)}}
pub(crate) struct Boundary<'a>{manager:&'a TaskManager}
impl<'a> Boundary<'a>{
    pub fn new(actual_label:&str,manager:&'a TaskManager)->Result<Self,TaskError>{require_main(actual_label)?;Ok(Self{manager})}
    pub fn reserve(&self,request:ReserveRequest)->Result<String,TaskError>{self.manager.reserve("main",request.into_core()?,true)}
    pub async fn start(&self,reservation_id:&str)->Result<(),TaskError>{id(reservation_id)?;self.manager.start("main",reservation_id).await}
    pub fn write(&self,request:WriteRequest)->Result<(),TaskError>{id(&request.reservation_id)?;self.manager.write("main",&request.reservation_id,&request.data)}
    pub fn write_text(&self,request:WriteTextRequest)->Result<(),TaskError>{id(&request.reservation_id)?;self.manager.write_text("main",&request.reservation_id,&request.data)}
    pub fn close_stdin(&self,reservation_id:&str)->Result<(),TaskError>{id(reservation_id)?;self.manager.close_stdin("main",reservation_id)}
    pub fn signal(&self,request:SignalRequest)->Result<(),TaskError>{id(&request.reservation_id)?;self.manager.signal("main",&request.reservation_id,request.signal.into())}
    pub fn read(&self,request:ReadRequest)->Result<ReadReplyDto,TaskError>{
        id(&request.reservation_id)?;let ack=request.ack.map(|value|crate::legacy_ipc::counter(&value).filter(|n|*n>0).ok_or(TaskError::InvalidAck)).transpose()?;
        self.manager.read("main",&request.reservation_id,ack).map(Into::into)
    }
    pub fn status(&self,reservation_id:&str)->Result<StatusDto,TaskError>{id(reservation_id)?;self.manager.status("main",reservation_id).map(Into::into)}
    pub fn cancel(&self,reservation_id:&str)->Result<(),TaskError>{id(reservation_id)?;self.manager.cancel("main",reservation_id)}
    pub async fn close(&self,reservation_id:&str)->Result<(),TaskError>{id(reservation_id)?;self.manager.close("main",reservation_id).await}
}
