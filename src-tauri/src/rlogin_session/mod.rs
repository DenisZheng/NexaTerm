//! 有界原生会话 owner；IPC由rlogin_runtime接入，终端UI已接入，DNS与start actor共同归属。
mod actor;
mod dns;
pub use dns::Destination;
mod buffers;
mod manager;
mod types;
mod text;
#[cfg(test)] mod tests;
#[cfg(test)] mod buffer_tests;
#[cfg(test)] mod native_tests;
#[cfg(test)] mod lifecycle_tests;
#[cfg(test)] mod text_tests;
pub use manager::SessionManager;
pub use types::{Ack, OutputFrame, Phase, ReadReply, SessionError, SessionRequest, SessionStatus};
use buffers::Queues;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, MutexGuard};
use tokio::sync::watch;

struct Shared {
    queues: Mutex<Queues>, cancel: Arc<AtomicBool>, abandoned: AtomicBool, done: watch::Sender<bool>,
    encoding: text::SessionEncoding,
}
impl Shared {
    fn new(encoding: text::SessionEncoding) -> Arc<Self> {
        let (done, _) = watch::channel(false);
        Arc::new(Self { queues: Mutex::new(Queues::new()), cancel: Arc::new(AtomicBool::new(false)),
            abandoned: AtomicBool::new(false), done, encoding })
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

impl crate::legacy_session::ManagedState for Shared {
    fn signal_cancel(&self) { let _ = self.cancel(); }
    fn completion(&self) -> watch::Receiver<bool> { self.done.subscribe() }
}
impl From<crate::legacy_session::LeaseError> for SessionError {
    fn from(error:crate::legacy_session::LeaseError)->Self {use crate::legacy_session::LeaseError as E;match error {
        E::Busy=>Self::Busy,E::Expired=>Self::Expired,E::Duplicate=>Self::Duplicate,E::Unavailable=>Self::Unavailable,
    }}
}
