//! Small shared lease table; protocol actors keep their own queues and semantics.
use crate::legacy_dns::Resolver;
use std::{collections::HashMap, sync::{Arc, Mutex}, time::{Duration, Instant}};
use tokio::sync::{watch, OwnedSemaphorePermit, Semaphore};
pub(crate) const TTL: Duration = Duration::from_secs(15);
const MAX_HANDLES: usize = 16;
const MAX_WORKERS: usize = 4;
pub(crate) struct Resources { pub resolver: Resolver, pub workers: Arc<Semaphore> }
impl Default for Resources {
    fn default() -> Self { Self {resolver:Resolver::default(),workers:Arc::new(Semaphore::new(MAX_WORKERS))} }
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub(crate) enum LeaseError { Busy, Expired, Duplicate, Unavailable }
pub(crate) trait ManagedState {
    fn signal_cancel(&self);
    fn completion(&self) -> watch::Receiver<bool>;
}
pub(crate) struct Entry<R,S> {pub created:Instant,pub request:Option<R>,pub state:Arc<S>}
pub(crate) struct Registry<R,S> {pub entries:HashMap<String,Entry<R,S>>,pub closed:bool}
pub(crate) struct LeasePool<R,S> {
    pub registry:Mutex<Registry<R,S>>,pub resources:Arc<Resources>,
}
impl<R,S:ManagedState> LeasePool<R,S> {
    pub fn new(resources:Arc<Resources>)->Self {
        Self {registry:Mutex::new(Registry {entries:HashMap::new(),closed:false}),resources}
    }
    pub fn reserve(&self,request:R,state:Arc<S>)->Result<String,LeaseError> {
        let mut registry=self.registry.lock().map_err(|_|LeaseError::Unavailable)?;
        if registry.closed {return Err(LeaseError::Unavailable);}
        registry.entries.retain(|_,entry|entry.request.is_none() || entry.created.elapsed()<TTL);
        if registry.entries.len()>=MAX_HANDLES {return Err(LeaseError::Busy);}
        let id=uuid::Uuid::new_v4().to_string();
        registry.entries.insert(id.clone(),Entry {created:Instant::now(),request:Some(request),state});Ok(id)
    }
    pub fn begin(&self,id:&str)->Result<(Arc<S>,R,OwnedSemaphorePermit),LeaseError> {
        let mut registry=self.registry.lock().map_err(|_|LeaseError::Unavailable)?;
        if registry.closed {return Err(LeaseError::Unavailable);}
        let entry=registry.entries.get_mut(id).ok_or(LeaseError::Expired)?;
        if entry.request.is_none() {return Err(LeaseError::Duplicate);}
        if entry.created.elapsed()>=TTL {registry.entries.remove(id);return Err(LeaseError::Expired);}
        let permit=match self.resources.workers.clone().try_acquire_owned() {
            Ok(permit)=>permit,Err(_)=>{registry.entries.remove(id);return Err(LeaseError::Busy);}
        };
        let entry=registry.entries.get_mut(id).ok_or(LeaseError::Expired)?;
        let request=entry.request.take().ok_or(LeaseError::Duplicate)?;
        Ok((entry.state.clone(),request,permit))
    }
    pub fn state(&self,id:&str)->Result<Arc<S>,LeaseError> {
        self.registry.lock().map_err(|_|LeaseError::Unavailable)?.entries.get(id).map(|e|e.state.clone()).ok_or(LeaseError::Expired)
    }
    pub fn cancel(&self,id:&str)->Result<(),LeaseError> {
        let mut registry=self.registry.lock().map_err(|_|LeaseError::Unavailable)?;
        if let Some(entry)=registry.entries.get(id) {
            entry.state.signal_cancel();
            if entry.request.is_some(){registry.entries.remove(id);}
        }Ok(())
    }
    pub async fn close(&self,id:&str)->Result<(),LeaseError> {
        let mut done={
            let mut registry=self.registry.lock().map_err(|_|LeaseError::Unavailable)?;
            let Some(entry)=registry.entries.get(id) else {return Ok(());};
            entry.state.signal_cancel();
            if entry.request.is_some(){registry.entries.remove(id);return Ok(());}
            entry.state.completion()
        };
        wait(&mut done).await?;
        self.registry.lock().map_err(|_|LeaseError::Unavailable)?.entries.remove(id);Ok(())
    }
    fn shutdown_receivers(&self)->Result<Vec<watch::Receiver<bool>>,LeaseError> {
        let mut registry=self.registry.lock().map_err(|_|LeaseError::Unavailable)?;
        registry.closed=true;let mut waiting=Vec::new();
        registry.entries.retain(|_,entry|{
            entry.state.signal_cancel();
            if entry.request.is_some(){return false;}
            let done=entry.state.completion();let finished=*done.borrow();waiting.push(done);!finished
        });Ok(waiting)
    }
    pub fn shutdown(&self){let _=self.shutdown_receivers();}
    pub async fn shutdown_wait(&self)->Result<(),LeaseError>{
        let waiting=self.shutdown_receivers()?;
        for mut done in waiting {wait(&mut done).await?;}Ok(())
    }
}
async fn wait(done:&mut watch::Receiver<bool>)->Result<(),LeaseError>{
    while !*done.borrow_and_update(){done.changed().await.map_err(|_|LeaseError::Unavailable)?;}Ok(())
}
