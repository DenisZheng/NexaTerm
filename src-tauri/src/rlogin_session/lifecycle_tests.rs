use super::{tests::*, *};
use crate::{legacy_socket::{fixture::pair, SocketError}, rlogin_ipc::{Boundary, ReadRequest, AckDto}, rlogin_native::RloginReader};
use std::{io::{self, Read}, net::Shutdown};
use tokio::sync::oneshot;
#[test]
fn metadata_status_never_consumes_or_removes_final_output_and_ipc_keeps_ack_credit() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        send(&mut session.peer,b"last\0\xff").await; session.peer.shutdown(Shutdown::Write).unwrap();
        session.state.wait_done().await.unwrap();
        let b=Boundary::new("main",&manager).unwrap();
        for _ in 0..3 { let s=b.status(&session.id).unwrap(); assert_eq!(s.phase,"closed"); assert!(!s.finished && !s.awaiting_ack); }
        assert_eq!(manager.handle_count(),1);
        let mut bytes=Vec::new();
        if cfg!(windows) {
            assert_eq!(b.read(ReadRequest {reservation_id:session.id.clone(),epoch:"0".into(),ack:None}).err(),Some(SocketError::UrgentBoundaryUnavailable.into()));
            let mut ack=None;
            loop {
                let reply=manager.read("main",&session.id,0,ack).unwrap();
                if let Some(data)=reply.frame {
                    bytes.extend_from_slice(&data.data); ack=Some(Ack{epoch:data.epoch,sequence:data.sequence});
                } else { assert!(reply.finished); break; }
            }
        } else {
            let mut ack=None; let mut checked_bad_ack=false;
            loop {
                let reply=b.read(ReadRequest {reservation_id:session.id.clone(),epoch:"0".into(),ack}).unwrap();
                if let Some(data)=reply.frame {
                    bytes.extend_from_slice(&data.data); assert!(b.status(&session.id).unwrap().awaiting_ack);
                    if !checked_bad_ack {
                        let bad=ReadRequest {reservation_id:session.id.clone(),epoch:"0".into(),ack:Some(AckDto {epoch:"0".into(),sequence:"1e3".into()})};
                        assert_eq!(b.read(bad).err(),Some(SessionError::InvalidAck)); assert!(b.status(&session.id).unwrap().awaiting_ack);
                        checked_bad_ack=true;
                    }
                    ack=Some(AckDto {epoch:data.epoch,sequence:data.sequence});
                } else { assert!(reply.finished); assert!(checked_bad_ack); break; }
            }
        }
        assert_eq!(bytes,b"last\0\xff");
        assert_eq!(b.status(&session.id).err().unwrap(),SessionError::Expired);
        eof(&mut session.peer).await; session.task.await.unwrap();
    });
}
#[test]
fn shutdown_wait_keeps_actual_starting_socket_and_worker_quota_until_the_gate_is_released() {
    runtime().block_on(async {
        let manager=Arc::new(SessionManager::default()); let id=manager.reserve("main",request(),true).unwrap();
        manager.reserve("main",request(),true).unwrap();
        let (socket,mut peer)=pair(); peer.set_nonblocking(true).unwrap(); let reader=RloginReader::new(socket,24,80,0,0).unwrap();
        let (entered,started)=oneshot::channel(); let (release,released)=oneshot::channel();
        let copy=manager.clone(); let target=id.clone();
        let start=tokio::spawn(async move { copy.start_with("main",&target,move |lease,request,ready| async move {
            drop(request); assert!(entered.send(lease.state.clone()).is_ok()); released.await.unwrap(); actor::established(reader,lease,Some(ready)).await;
        }).await });
        let state=started.await.unwrap(); let copy=manager.clone(); let ending=tokio::spawn(async move {copy.shutdown_wait().await});
        tokio::task::yield_now().await;
        assert!(!ending.is_finished()); assert!(state.cancel.load(Ordering::Acquire)); assert!(!*state.done.borrow());
        assert_eq!(manager.available_workers(),3); assert_eq!(manager.handle_count(),1);
        assert_eq!(peer.read(&mut [0_u8;1]).unwrap_err().kind(),io::ErrorKind::WouldBlock);
        assert_eq!(manager.reserve("main",request(),true).err(),Some(SessionError::Unavailable));
        release.send(()).unwrap(); assert_eq!(start.await.unwrap(),Err(SocketError::Cancelled.into())); ending.await.unwrap().unwrap();
        eof(&mut peer).await; assert_eq!(manager.available_workers(),4); assert_eq!(manager.handle_count(),0);
        manager.shutdown_wait().await.unwrap();
    });
}
#[test]
fn only_main_window_destruction_closes_admission_and_cancels_all_real_workers() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut a=fixture(&manager).await; let mut b=fixture(&manager).await;
        manager.cancel_window("vnc-runner-host");
        assert_eq!(manager.status("main",&a.id).unwrap().phase,Phase::InitialExchangeReady); assert_eq!(manager.available_workers(),2);
        manager.cancel_window("main"); assert_eq!(manager.available_workers(),2);
        assert_eq!(manager.reserve("main",request(),true).err(),Some(SessionError::Unavailable));
        manager.shutdown_wait().await.unwrap(); eof(&mut a.peer).await; eof(&mut b.peer).await;
        a.task.await.unwrap(); b.task.await.unwrap(); assert_eq!(manager.available_workers(),4); assert_eq!(manager.handle_count(),0);
    });
}
