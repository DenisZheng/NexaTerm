//! 有界原生会话 owner；IPC由rlogin_runtime接入，DNS/终端UI仍待实现。
mod actor;
mod buffers;
mod manager;
mod types;
#[cfg(test)] mod tests;
#[cfg(test)] mod buffer_tests;
#[cfg(test)] mod native_tests;
#[cfg(test)] mod lifecycle_tests;
pub use manager::SessionManager;
pub use types::{Ack, OutputFrame, Phase, ReadReply, SessionError, SessionRequest, SessionStatus};
use buffers::Queues;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, MutexGuard};
use tokio::sync::watch;

struct Shared {
    queues: Mutex<Queues>, cancel: AtomicBool, abandoned: AtomicBool, done: watch::Sender<bool>,
}
impl Shared {
    fn new() -> Arc<Self> {
        let (done, _) = watch::channel(false);
        Arc::new(Self { queues: Mutex::new(Queues::new()), cancel: AtomicBool::new(false),
            abandoned: AtomicBool::new(false), done })
    }
    fn lock(&self) -> Result<MutexGuard<'_, Queues>, SessionError> { self.queues.lock().map_err(|_| SessionError::Unavailable) }
    fn cancel(&self) -> Result<(), SessionError> {
        self.cancel.store(true, Ordering::Release);
        let mut q = self.lock()?;
        if matches!(q.phase, Phase::Reserved | Phase::Starting | Phase::InitialExchangeReady) { q.phase = Phase::Closing; }
        Ok(())
    }
    async fn wait_done(&self) -> Result<(), SessionError> {
        let mut done = self.done.subscribe();
        while !*done.borrow_and_update() { done.changed().await.map_err(|_| SessionError::Unavailable)?; }
        Ok(())
    }
}
