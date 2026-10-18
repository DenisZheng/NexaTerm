use super::{actor, Ack, Phase, ReadReply, SessionError, SessionRequest, SessionStatus, Shared};
use crate::legacy_socket::CONNECT_TIMEOUT;
use crate::rlogin_connect::WindowSize;
use std::{sync::{atomic::Ordering, Arc}, time::Instant};
use tokio::sync::{oneshot, OwnedSemaphorePermit};
use crate::legacy_session::{LeasePool, Resources};
struct Inner { pool: LeasePool<SessionRequest, Shared> }
pub struct SessionManager { inner: Arc<Inner> }
pub(super) struct WorkerLease {
    pub state: Arc<Shared>, inner: Arc<Inner>, id: String, permit: Option<OwnedSemaphorePermit>,
    pub result: (Phase, Option<SessionError>), pub discard: bool, pub deadline: Instant,
}
impl WorkerLease {
    pub(super) async fn resolve(&self, destination: &super::Destination) -> Result<std::net::SocketAddrV4, SessionError> {
        self.inner.pool.resources.resolver.resolve(destination, &self.state.cancel, self.deadline).await.map_err(Into::into)
    }
}
impl Drop for WorkerLease {
    fn drop(&mut self) {
        if let Ok(mut q) = self.state.lock() { q.finish(self.result.0, self.result.1); }
        drop(self.permit.take());
        if let Ok(mut registry) = self.inner.pool.registry.lock() {
            if self.discard || self.state.abandoned.load(Ordering::Acquire) || registry.closed { registry.entries.remove(&self.id); }
        }
        self.state.done.send_replace(true);
    }
}
struct CancelStart { state: Arc<Shared>, armed: bool }
impl Drop for CancelStart {
    fn drop(&mut self) {
        if self.armed { self.state.abandoned.store(true, Ordering::Release); let _ = self.state.cancel(); }
    }
}
fn owner(owner: &str) -> Result<(), SessionError> { if owner == "main" { Ok(()) } else { Err(SessionError::Denied) } }
impl Default for SessionManager {
    fn default() -> Self {
        Self::with_resources(Arc::new(Resources::default()))
    }
}
impl Drop for SessionManager { fn drop(&mut self) { self.shutdown(); } }
impl SessionManager {
    pub(crate) fn with_resources(resources: Arc<Resources>) -> Self { Self { inner: Arc::new(Inner { pool: LeasePool::new(resources) }) } }
    pub fn reserve(&self, origin: &str, request: SessionRequest, consent: bool) -> Result<String, SessionError> {
        owner(origin)?;
        if !consent { return Err(SessionError::ConsentRequired); }
        let encoding = super::text::SessionEncoding::new(&request.terminal_encoding)?;
        request.validate()?;
        self.inner.pool.reserve(request, Shared::new(encoding)).map_err(Into::into)
    }
    pub(super) fn begin(&self, origin: &str, id: &str) -> Result<(WorkerLease, SessionRequest), SessionError> {
        owner(origin)?;
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        let (state, request, permit) = self.inner.pool.begin(id)?;
        state.lock()?.phase = Phase::Starting;
        Ok((WorkerLease { state, inner: self.inner.clone(), id: id.to_owned(), permit: Some(permit),
            result: (Phase::Failed, Some(SessionError::Unavailable)), discard: false, deadline }, request))
    }
    pub async fn start(&self, origin: &str, id: &str) -> Result<(), SessionError> {
        self.start_with(origin, id, actor::connect).await
    }
    pub(super) async fn start_with<F, Fut>(&self, origin: &str, id: &str, launch: F) -> Result<(), SessionError>
    where F: FnOnce(WorkerLease, SessionRequest, oneshot::Sender<Result<(), SessionError>>) -> Fut + Send,
        Fut: std::future::Future<Output=()> + Send + 'static {
        let (lease, request) = self.begin(origin, id)?; let state = lease.state.clone();
        let mut guard = CancelStart { state: state.clone(), armed: true };
        let (ready, received) = oneshot::channel();
        tokio::spawn(launch(lease, request, ready));
        let result = received.await.unwrap_or(Err(SessionError::Unavailable));
        if result.is_err() { state.wait_done().await?; }
        guard.armed = false; result
    }
    fn state(&self, origin: &str, id: &str) -> Result<Arc<Shared>, SessionError> {
        owner(origin)?;
        self.inner.pool.state(id).map_err(Into::into)
    }
    pub fn write(&self, origin: &str, id: &str, bytes: &[u8]) -> Result<(), SessionError> {
        let state = self.state(origin, id)?; let result = state.lock()?.write(bytes); result
    }
    pub fn write_text(&self, origin: &str, id: &str, data: &str) -> Result<(), SessionError> {
        let state = self.state(origin, id)?;
        let bytes = state.encoding.encode(data)?;
        let result = state.lock()?.write(&bytes); result
    }
    pub fn resize(&self, origin: &str, id: &str, size: WindowSize) -> Result<(), SessionError> {
        owner(origin)?;
        crate::rlogin::window_size_frame(size.rows, size.columns, size.x_pixels, size.y_pixels)
            .map_err(|e| SessionError::Connect(e.into()))?;
        let state = self.state(origin, id)?; let mut q = state.lock()?;
        if q.phase != Phase::InitialExchangeReady { return Err(SessionError::NotReady); }
        q.resize = Some(size); Ok(())
    }
    pub fn read(&self, origin: &str, id: &str, last_epoch: u64, ack: Option<Ack>) -> Result<ReadReply, SessionError> {
        let state = self.state(origin, id)?;
        let reply = state.lock()?.read(last_epoch, ack, *state.done.borrow())?;
        if reply.finished {
            self.inner.pool.registry.lock().map_err(|_| SessionError::Unavailable)?.entries.remove(id);
        }
        Ok(reply)
    }
    pub fn status(&self, origin: &str, id: &str) -> Result<SessionStatus, SessionError> {
        let state = self.state(origin, id)?;
        let status = state.lock()?.status(*state.done.borrow()); Ok(status)
    }
    pub fn cancel(&self, origin:&str,id:&str)->Result<(),SessionError>{ owner(origin)?; self.inner.pool.cancel(id).map_err(Into::into) }
    pub async fn close(&self, origin:&str,id:&str)->Result<(),SessionError>{owner(origin)?;self.inner.pool.close(id).await.map_err(Into::into)}
    pub fn shutdown(&self){self.inner.pool.shutdown();}
    pub fn cancel_window(&self,origin:&str){if origin=="main" {self.shutdown();}}
    pub async fn shutdown_wait(&self)->Result<(),SessionError>{self.inner.pool.shutdown_wait().await.map_err(Into::into)}
}

#[cfg(test)] impl SessionManager {
    pub(super) fn available_workers(&self) -> usize { self.inner.pool.resources.workers.available_permits() }
    pub(super) fn handle_count(&self) -> usize { self.inner.pool.registry.lock().unwrap().entries.len() }
    pub(super) fn expire(&self, id: &str) { self.inner.pool.registry.lock().unwrap().entries.get_mut(id).unwrap().created -= crate::legacy_session::TTL; }
}
