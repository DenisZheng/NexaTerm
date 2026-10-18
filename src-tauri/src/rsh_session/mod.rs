//! Explicit command-task ownership; no terminal, history or persistence integration.
mod actor;
mod buffers;
mod manager;
mod types;
#[cfg(test)] mod tests;
#[cfg(test)] mod lifecycle_tests;
pub use manager::TaskManager;
pub use types::{TaskRequest,TaskError,Phase,Stream,OutputFrame,TaskStatus,ReadReply};
use crate::{legacy_session::ManagedState,legacy_text::SessionEncoding};
use buffers::Queues;
use std::sync::{Arc,Mutex,MutexGuard,atomic::{AtomicBool,Ordering}};
use tokio::sync::watch;
struct Shared {
    queues:Mutex<Queues>,cancel:Arc<AtomicBool>,abandoned:AtomicBool,done:watch::Sender<bool>,encoding:SessionEncoding,
}
impl Shared {
    fn new(encoding:SessionEncoding)->Arc<Self>{let(done,_)=watch::channel(false);Arc::new(Self{
        queues:Mutex::new(Queues::new()),cancel:Arc::new(AtomicBool::new(false)),abandoned:AtomicBool::new(false),done,encoding,
    })}
    fn lock(&self)->Result<MutexGuard<'_,Queues>,TaskError>{self.queues.lock().map_err(|_|TaskError::Unavailable)}
    fn cancel(&self){self.cancel.store(true,Ordering::Release);if let Ok(mut q)=self.lock(){
        if matches!(q.phase,Phase::Reserved|Phase::Starting|Phase::InitialExchangeReady){q.phase=Phase::Closing;}
    }}
    async fn wait_done(&self)->Result<(),TaskError>{let mut done=self.done.subscribe();
        while !*done.borrow_and_update(){done.changed().await.map_err(|_|TaskError::Unavailable)?;}Ok(())
    }
}
impl ManagedState for Shared {
    fn signal_cancel(&self){self.cancel();}
    fn completion(&self)->watch::Receiver<bool>{self.done.subscribe()}
}
