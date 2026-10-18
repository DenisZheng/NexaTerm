use super::{actor, Ack, Phase, ReadReply, SessionError, SessionRequest, SessionStatus, Shared};
use crate::legacy_socket::CONNECT_TIMEOUT;
use crate::rlogin_connect::WindowSize;
use std::{collections::HashMap, sync::{atomic::Ordering, Arc, Mutex}, time::{Duration, Instant}};
use tokio::sync::{oneshot, OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;
const MAX_HANDLES: usize = 16;
const MAX_WORKERS: usize = 4;
const TTL: Duration = Duration::from_secs(15);
struct Entry { created: Instant, request: Option<SessionRequest>, state: Arc<Shared> }
struct Registry { entries: HashMap<String, Entry>, closed: bool }
struct Inner { registry: Mutex<Registry>, workers: Arc<Semaphore>, resolver: super::dns::Resolver }
pub struct SessionManager { inner: Arc<Inner> }
pub(super) struct WorkerLease {
    pub state: Arc<Shared>, inner: Arc<Inner>, id: String, permit: Option<OwnedSemaphorePermit>,
    pub result: (Phase, Option<SessionError>), pub discard: bool, pub deadline: Instant,
}
impl WorkerLease {
    pub(super) async fn resolve(&self, destination: &super::Destination) -> Result<std::net::SocketAddrV4, SessionError> {
        self.inner.resolver.resolve(destination, &self.state.cancel, self.deadline).await
    }
}
impl Drop for WorkerLease {
    fn drop(&mut self) {
        if let Ok(mut q) = self.state.lock() { q.finish(self.result.0, self.result.1); }
        drop(self.permit.take());
        if let Ok(mut registry) = self.inner.registry.lock() {
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
        Self { inner: Arc::new(Inner { registry: Mutex::new(Registry { entries: HashMap::new(), closed: false }),
            resolver: super::dns::Resolver::default(), workers: Arc::new(Semaphore::new(MAX_WORKERS)) }) }
    }
}
impl Drop for SessionManager { fn drop(&mut self) { self.shutdown(); } }
impl SessionManager {
    pub fn reserve(&self, origin: &str, request: SessionRequest, consent: bool) -> Result<String, SessionError> {
        owner(origin)?;
        if !consent { return Err(SessionError::ConsentRequired); }
        let encoding = super::text::SessionEncoding::new(&request.terminal_encoding)?;
        request.validate()?;
        let mut registry = self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?;
        if registry.closed { return Err(SessionError::Unavailable); }
        registry.entries.retain(|_, e| e.request.is_none() || e.created.elapsed() < TTL);
        if registry.entries.len() >= MAX_HANDLES { return Err(SessionError::Busy); }
        let id = Uuid::new_v4().to_string();
        registry.entries.insert(id.clone(), Entry { created: Instant::now(), request: Some(request), state: Shared::new(encoding) }); Ok(id)
    }
    pub(super) fn begin(&self, origin: &str, id: &str) -> Result<(WorkerLease, SessionRequest), SessionError> {
        owner(origin)?;
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        let mut registry = self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?;
        if registry.closed { return Err(SessionError::Unavailable); }
        let entry = registry.entries.get_mut(id).ok_or(SessionError::Expired)?;
        if entry.request.is_none() { return Err(SessionError::Duplicate); }
        if entry.created.elapsed() >= TTL { registry.entries.remove(id); return Err(SessionError::Expired); }
        let state = entry.state.clone();
        state.lock()?.phase = Phase::Starting;
        let request = entry.request.take().ok_or(SessionError::Duplicate)?;
        let permit = match self.inner.workers.clone().try_acquire_owned() {
            Ok(permit) => permit, Err(_) => { registry.entries.remove(id); return Err(SessionError::Busy); },
        };
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
        self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?.entries.get(id).map(|e| e.state.clone()).ok_or(SessionError::Expired)
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
            self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?.entries.remove(id);
        }
        Ok(reply)
    }
    pub fn status(&self, origin: &str, id: &str) -> Result<SessionStatus, SessionError> {
        let state = self.state(origin, id)?;
        let status = state.lock()?.status(*state.done.borrow()); Ok(status)
    }
    pub fn cancel(&self, origin: &str, id: &str) -> Result<(), SessionError> {
        owner(origin)?;
        let mut registry = self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?;
        if let Some(entry) = registry.entries.get(id) {
            entry.state.cancel()?;
            if entry.request.is_some() { registry.entries.remove(id); }
        }
        Ok(())
    }
    pub async fn close(&self, origin: &str, id: &str) -> Result<(), SessionError> {
        owner(origin)?;
        let state = {
            let mut registry = self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?;
            let Some(entry) = registry.entries.get(id) else { return Ok(()); };
            entry.state.cancel()?;
            if entry.request.is_some() { registry.entries.remove(id); return Ok(()); }
            entry.state.clone()
        };
        state.wait_done().await?;
        self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?.entries.remove(id); Ok(())
    }
    fn shutdown_states(&self) -> Result<Vec<Arc<Shared>>, SessionError> {
        let mut registry = self.inner.registry.lock().map_err(|_| SessionError::Unavailable)?;
        registry.closed = true; let mut waiting = Vec::new();
        registry.entries.retain(|_, entry| {
            // cancel先写入sticky原子信号；即使队列poison，仍继续取消其它worker。
            let _ = entry.state.cancel();
            if entry.request.is_some() { return false; }
            waiting.push(entry.state.clone()); !*entry.state.done.borrow()
        });
        Ok(waiting)
    }
    pub fn shutdown(&self) { let _ = self.shutdown_states(); }
    pub fn cancel_window(&self, origin: &str) { if origin == "main" { self.shutdown(); } }
    pub async fn shutdown_wait(&self) -> Result<(), SessionError> {
        let waiting = self.shutdown_states()?;
        // 不持registry锁跨await；worker必须先关闭FD/归还额度，再通知完成。
        for state in waiting { state.wait_done().await?; }
        Ok(())
    }
}

#[cfg(test)] impl SessionManager {
    pub(super) fn available_workers(&self) -> usize { self.inner.workers.available_permits() }
    pub(super) fn handle_count(&self) -> usize { self.inner.registry.lock().unwrap().entries.len() }
    pub(super) fn expire(&self, id: &str) { self.inner.registry.lock().unwrap().entries.get_mut(id).unwrap().created -= TTL; }
}
