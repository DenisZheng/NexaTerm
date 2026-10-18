use super::{manager::WorkerLease,TaskRequest,TaskError,Phase,Stream};
use crate::{legacy_socket::{SocketError,CANCEL_POLL,MAX_CHUNK},rsh::{self,RshTransport}};
use std::{sync::atomic::Ordering,time::{Instant,Duration}};
use tokio::sync::oneshot;
pub(super) async fn connect(mut lease:WorkerLease,request:TaskRequest,ready:oneshot::Sender<Result<(),TaskError>>){
    let result=match lease.resolve(&request.target).await{
        Ok(target)=>rsh::connect_until(request.options(target),&lease.state.cancel,lease.deadline).await.map_err(Into::into),
        Err(error)=>Err(error),
    };
    let timeout=request.run_timeout_seconds;drop(request);
    match result{
        Ok(transport)=>established(transport,lease,Some(ready),timeout).await,
        Err(error)=>{lease.result=(Phase::Failed,Some(error));lease.discard=true;let _=ready.send(Err(error));}
    }
}
struct Pending {bytes:Vec<u8>,offset:usize}
// Declaration order also governs abort: sockets and pending command input before the completion lease.
struct Run {transport:Option<RshTransport>,pending:Option<Pending>,expires:Option<Instant>,next:Stream,lease:WorkerLease}
pub(super) async fn established(transport:RshTransport,lease:WorkerLease,ready:Option<oneshot::Sender<Result<(),TaskError>>>,timeout:u32){
    Run{transport:Some(transport),pending:None,expires:if timeout==0{None}else{Some(Instant::now()+Duration::from_secs(timeout.into()))},
        next:Stream::Stdout,lease}.drive(ready).await;
}
impl Run {
    async fn drive(mut self,ready:Option<oneshot::Sender<Result<(),TaskError>>>){
        let state=self.lease.state.clone();
        let opening=if state.cancel.load(Ordering::Acquire){Err(SocketError::Cancelled.into())}
            else{state.lock().map(|mut q|{q.phase=Phase::InitialExchangeReady;})};
        if let Err(error)=opening{self.lease.result=(Phase::Failed,Some(error));self.lease.discard=true;
            if let Some(ready)=ready{let _=ready.send(Err(error));}return;}
        if let Some(ready)=ready{if ready.send(Ok(())).is_err(){state.abandoned.store(true,Ordering::Release);state.cancel();}}
        self.lease.result=loop{
            if state.cancel.load(Ordering::Acquire){break(Phase::Closed,Some(SocketError::Cancelled.into()));}
            if self.expires.is_some_and(|expires|Instant::now()>=expires){break(Phase::Failed,Some(TaskError::RunTimeout));}
            match self.step(){Ok(true)=>{},Ok(false)=>break(Phase::Closed,None),Err(error)=>break(Phase::Failed,Some(error))}
            tokio::time::sleep(CANCEL_POLL).await;
        };
        // Both close operations run before completion/permit publication, even on an earlier IO failure.
        if let Some(transport)=self.transport.take(){if let Err(error)=transport.close(){
            if self.lease.result.1.is_none(){self.lease.result=(Phase::Failed,Some(error.into()));}
        }}
        self.pending=None;
    }
    fn step(&mut self)->Result<bool,TaskError>{
        self.input()?;self.signals()?;
        let first=self.next;let second=if first==Stream::Stdout{Stream::Stderr}else{Stream::Stdout};self.next=second;
        self.output(first)?;self.output(second)?;
        Ok(!self.transport.as_ref().ok_or(TaskError::Unavailable)?.output_complete())
    }
    fn input(&mut self)->Result<(),TaskError>{
        if self.pending.is_none(){let bytes=self.lease.state.lock()?.take_input();if let Some(bytes)=bytes{self.pending=Some(Pending{bytes,offset:0});}}
        let transport=self.transport.as_mut().ok_or(TaskError::Unavailable)?;
        if let Some(pending)=&mut self.pending{
            if let Some(count)=transport.write_stdin(&pending.bytes[pending.offset..])?{
                if count==0{return Err(SocketError::IoFailed.into());}
                pending.offset=pending.offset.checked_add(count).filter(|n|*n<=pending.bytes.len()).ok_or(TaskError::Unavailable)?;
                if pending.offset==pending.bytes.len(){self.lease.state.lock()?.input_complete(pending.bytes.len())?;self.pending=None;}
            }
        }
        if self.lease.state.lock()?.eof_ready(){transport.close_stdin()?;self.lease.state.lock()?.stdin_eof=true;}Ok(())
    }
    fn signals(&mut self)->Result<(),TaskError>{
        let signal=self.lease.state.lock()?.signals.front().copied();
        if let Some(signal)=signal{if self.transport.as_mut().ok_or(TaskError::Unavailable)?.send_signal(signal)?.is_some(){
            self.lease.state.lock()?.signals.pop_front();
        }}Ok(())
    }
    fn output(&mut self,stream:Stream)->Result<(),TaskError>{
        if !self.lease.state.lock()?.can_read(stream){return Ok(());}
        let mut buffer=[0_u8;MAX_CHUNK];let transport=self.transport.as_mut().ok_or(TaskError::Unavailable)?;
        match if stream==Stream::Stdout{transport.read_stdout(&mut buffer)}else{transport.read_stderr(&mut buffer)}?{
            Some(0)=>self.lease.state.lock()?.output_eof[stream.index()]=true,
            Some(count)=>self.lease.state.lock()?.push_output(stream,&buffer[..count])?,None=>{},
        }Ok(())
    }
}
