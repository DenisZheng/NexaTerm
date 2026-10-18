use super::{actor,Shared,TaskRequest,TaskError,Phase,TaskStatus,ReadReply};
use crate::{legacy_session::{LeasePool,Resources},legacy_socket::CONNECT_TIMEOUT,rsh::Signal};
use std::{sync::{Arc,atomic::Ordering},time::Instant};
use tokio::sync::{oneshot,OwnedSemaphorePermit};
struct Inner {pool:LeasePool<TaskRequest,Shared>}
pub struct TaskManager {inner:Arc<Inner>}
pub(super) struct WorkerLease {
    pub state:Arc<Shared>,inner:Arc<Inner>,id:String,permit:Option<OwnedSemaphorePermit>,
    pub deadline:Instant,pub result:(Phase,Option<TaskError>),pub discard:bool,
}
impl WorkerLease {
    #[cfg(test)]
    pub async fn resolve_with<F>(&self,resolve:F)->Result<std::net::SocketAddrV4,TaskError>
    where F:FnOnce()->std::io::Result<Vec<std::net::SocketAddr>>+Send+'static {
        self.inner.pool.resources.resolver.resolve_with(&self.state.cancel,self.deadline,resolve).await.map_err(Into::into)
    }

    pub async fn resolve(&self,target:&crate::legacy_dns::Destination)->Result<std::net::SocketAddrV4,TaskError>{
        self.inner.pool.resources.resolver.resolve(target,&self.state.cancel,self.deadline).await.map_err(Into::into)
    }
}
impl Drop for WorkerLease {fn drop(&mut self){
    if let Ok(mut q)=self.state.lock(){q.finish(self.result.0,self.result.1);}
    drop(self.permit.take());
    if let Ok(mut r)=self.inner.pool.registry.lock(){if self.discard||self.state.abandoned.load(Ordering::Acquire)||r.closed{r.entries.remove(&self.id);}}
    self.state.done.send_replace(true);
}}
struct CancelStart {state:Arc<Shared>,armed:bool}
impl Drop for CancelStart {fn drop(&mut self){if self.armed{self.state.abandoned.store(true,Ordering::Release);self.state.cancel();}}}
fn owner(origin:&str)->Result<(),TaskError>{if origin=="main"{Ok(())}else{Err(TaskError::Denied)}}
impl Default for TaskManager {fn default()->Self{Self::with_resources(Arc::new(Resources::default()))}}
impl Drop for TaskManager {fn drop(&mut self){self.shutdown();}}
impl TaskManager {
    pub(crate) fn with_resources(resources:Arc<Resources>)->Self{Self{inner:Arc::new(Inner{pool:LeasePool::new(resources)})}}
    pub fn reserve(&self,origin:&str,request:TaskRequest,consent:bool)->Result<String,TaskError>{
        owner(origin)?;if !consent{return Err(TaskError::ConsentRequired);}let encoding=request.validate()?;
        self.inner.pool.reserve(request,Shared::new(encoding)).map_err(Into::into)
    }
    pub(super) fn begin(&self,origin:&str,id:&str)->Result<(WorkerLease,TaskRequest),TaskError>{
        owner(origin)?;let deadline=Instant::now()+CONNECT_TIMEOUT;let(state,request,permit)=self.inner.pool.begin(id)?;
        let lease=WorkerLease{state:state.clone(),inner:self.inner.clone(),id:id.to_owned(),permit:Some(permit),deadline,
            result:(Phase::Failed,Some(TaskError::Unavailable)),discard:false};
        state.lock()?.phase=Phase::Starting;Ok((lease,request))
    }
    pub async fn start(&self,origin:&str,id:&str)->Result<(),TaskError>{self.start_with(origin,id,actor::connect).await}
    pub(super) async fn start_with<F,Fut>(&self,origin:&str,id:&str,launch:F)->Result<(),TaskError>
    where F:FnOnce(WorkerLease,TaskRequest,oneshot::Sender<Result<(),TaskError>>)->Fut+Send,
        Fut:std::future::Future<Output=()>+Send+'static {
        let(lease,request)=self.begin(origin,id)?;let state=lease.state.clone();let mut guard=CancelStart{state:state.clone(),armed:true};
        let(ready,received)=oneshot::channel();tokio::spawn(launch(lease,request,ready));
        let result=received.await.unwrap_or(Err(TaskError::Unavailable));if result.is_err(){state.wait_done().await?;}
        guard.armed=false;result
    }
    fn state(&self,origin:&str,id:&str)->Result<Arc<Shared>,TaskError>{owner(origin)?;self.inner.pool.state(id).map_err(Into::into)}
    pub fn write(&self,origin:&str,id:&str,bytes:&[u8])->Result<(),TaskError>{let state=self.state(origin,id)?;let result=state.lock()?.write(bytes);result}
    pub fn write_text(&self,origin:&str,id:&str,text:&str)->Result<(),TaskError>{let state=self.state(origin,id)?;
        let bytes=state.encoding.encode(text)?;let result=state.lock()?.write(&bytes);result}
    pub fn close_stdin(&self,origin:&str,id:&str)->Result<(),TaskError>{let state=self.state(origin,id)?;let result=state.lock()?.close_stdin();result}
    pub fn signal(&self,origin:&str,id:&str,signal:Signal)->Result<(),TaskError>{let state=self.state(origin,id)?;let result=state.lock()?.signal(signal);result}
    pub fn read(&self,origin:&str,id:&str,ack:Option<u64>)->Result<ReadReply,TaskError>{let state=self.state(origin,id)?;
        let reply=state.lock()?.read(ack,*state.done.borrow())?;
        if reply.status.finished{self.inner.pool.registry.lock().map_err(|_|TaskError::Unavailable)?.entries.remove(id);}Ok(reply)
    }
    pub fn status(&self,origin:&str,id:&str)->Result<TaskStatus,TaskError>{let state=self.state(origin,id)?;let result=state.lock()?.status(*state.done.borrow());Ok(result)}
    pub fn cancel(&self,origin:&str,id:&str)->Result<(),TaskError>{owner(origin)?;self.inner.pool.cancel(id).map_err(Into::into)}
    pub async fn close(&self,origin:&str,id:&str)->Result<(),TaskError>{owner(origin)?;self.inner.pool.close(id).await.map_err(Into::into)}
    pub fn shutdown(&self){self.inner.pool.shutdown();}
    pub fn cancel_window(&self,origin:&str){if origin=="main"{self.shutdown();}}
    pub async fn shutdown_wait(&self)->Result<(),TaskError>{self.inner.pool.shutdown_wait().await.map_err(Into::into)}
}
#[cfg(test)] impl TaskManager {
    pub(super) fn available_workers(&self)->usize{self.inner.pool.resources.workers.available_permits()}
    pub(super) fn handle_count(&self)->usize{self.inner.pool.registry.lock().unwrap().entries.len()}
    pub(super) fn expire(&self,id:&str){self.inner.pool.registry.lock().unwrap().entries.get_mut(id).unwrap().created-=crate::legacy_session::TTL;}
}
