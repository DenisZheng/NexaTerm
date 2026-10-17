use super::{manager::WorkerLease, Phase, SessionError, SessionRequest};
use crate::legacy_socket::{SocketError, CANCEL_POLL, MAX_CHUNK};
use crate::rlogin_connect;
use crate::rlogin_native::{ReceiveEvent, RloginReader};
use std::sync::atomic::Ordering;
use tokio::sync::oneshot;

pub(super) async fn connect(mut lease: WorkerLease, request: SessionRequest, ready: oneshot::Sender<Result<(), SessionError>>) {
    let connected = rlogin_connect::connect_until(request.options(), &lease.state.cancel, lease.deadline).await;
    drop(request);
    match connected {
        Ok(reader) => established(reader, lease, Some(ready)).await,
        Err(error) => { lease.result = (Phase::Failed, Some(error.into())); lease.discard = true; let _ = ready.send(Err(error.into())); },
    }
}
struct PendingWrite { bytes: Vec<u8>, offset: usize, input_credit: Option<usize> }
// 字段按声明顺序析构：实际socket与正在写的payload先释放，最后才完成lease/额度通知。
struct Run { reader: RloginReader, current: Option<PendingWrite>, window: Option<[u8;12]>, lease: WorkerLease }
pub(super) async fn established(reader: RloginReader, lease: WorkerLease, ready: Option<oneshot::Sender<Result<(), SessionError>>>) {
    Run { reader, current: None, window: None, lease }.drive(ready).await;
}
impl Run {
    async fn drive(mut self, ready: Option<oneshot::Sender<Result<(), SessionError>>>) {
        let state = self.lease.state.clone();
        let opening = if state.cancel.load(Ordering::Acquire) { Err(SocketError::Cancelled.into()) }
            else { state.lock().map(|mut q| { q.phase = Phase::InitialExchangeReady; }) };
        if let Err(error) = opening {
            self.lease.result = (Phase::Failed, Some(error)); self.lease.discard = true;
            if let Some(ready) = ready { let _ = ready.send(Err(error)); } return;
        }
        if let Some(ready) = ready {
            if ready.send(Ok(())).is_err() { state.abandoned.store(true, Ordering::Release); let _ = state.cancel(); }
        }
        self.lease.result = loop {
            if state.cancel.load(Ordering::Acquire) { break (Phase::Closed, Some(SocketError::Cancelled.into())); }
            let result = self.step();
            if state.cancel.load(Ordering::Acquire) { break (Phase::Closed, Some(SocketError::Cancelled.into())); }
            match result { Ok(true) => {}, Ok(false) => break (Phase::Closed, None), Err(error) => break (Phase::Failed, Some(error)) }
            tokio::time::sleep(CANCEL_POLL).await;
        };
    }
    fn step(&mut self) -> Result<bool, SessionError> {
        let size = self.lease.state.lock()?.resize.take();
        if let Some(size) = size {
            if let Some(frame) = self.reader.resize(size.rows, size.columns, size.x_pixels, size.y_pixels).map_err(|e| SessionError::Connect(e.into()))? {
                self.window = Some(frame);
            }
        }
        let capacity = self.lease.state.lock()?.can_read(); let mut buffer = [0_u8;MAX_CHUNK];
        match self.reader.poll(&mut buffer, capacity)? {
            ReceiveEvent::Closed => return Ok(false),
            ReceiveEvent::Data(count) => self.lease.state.lock()?.push_output(&buffer[..count])?,
            ReceiveEvent::Control(control) => {
                if control.flush_output { self.lease.state.lock()?.flush()?; }
                if let Some(frame) = control.window_frame { self.window = Some(frame); }
            },
            ReceiveEvent::Idle => {},
        }
        if self.current.is_none() {
            if let Some(window) = self.window.take() {
                self.current = Some(PendingWrite { bytes: window.to_vec(), offset: 0, input_credit: None });
            } else {
                let input = self.lease.state.lock()?.take_input();
                if let Some(input) = input {
                    let credit = input.len(); let bytes = self.reader.input(&input)?; drop(input);
                    if bytes.is_empty() { self.lease.state.lock()?.input_complete(credit)?; }
                    else { self.current = Some(PendingWrite { bytes, offset: 0, input_credit: Some(credit) }); }
                }
            }
        }
        if let Some(current) = &mut self.current {
            if let Some(count) = self.reader.write(&current.bytes[current.offset..])? {
                if count == 0 { return Err(SocketError::IoFailed.into()); }
                current.offset = current.offset.checked_add(count).filter(|n| *n <= current.bytes.len()).ok_or(SessionError::Unavailable)?;
                if current.offset == current.bytes.len() {
                    if let Some(credit) = current.input_credit { self.lease.state.lock()?.input_complete(credit)?; }
                    self.current = None;
                }
            }
        }
        Ok(true)
    }
}
