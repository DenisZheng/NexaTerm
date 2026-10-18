use super::{tests::*,*};
use crate::{legacy_session::Resources,legacy_socket::SocketError};
use std::{sync::mpsc,net::{Ipv4Addr,SocketAddrV4},time::Duration};
#[test]
fn abort_waits_for_actual_socket_drops_before_reusing_worker_quota(){runtime().block_on(async{
    let manager=TaskManager::default();let mut run=fixture(&manager,0).await;assert_eq!(manager.available_workers(),3);
    run.task.abort();assert!(run.task.await.unwrap_err().is_cancelled());run.state.wait_done().await.unwrap();
    eof(&mut run.main).await;eof(&mut run.secondary).await;assert_eq!(manager.available_workers(),4);
    assert_eq!(manager.status("main",&run.id).unwrap().reason,Some(TaskError::Unavailable));manager.close("main",&run.id).await.unwrap();
});}
#[test]
fn shared_worker_admission_is_nonwaiting_and_shutdown_keeps_real_leases(){runtime().block_on(async{
    let resources=Arc::new(Resources::default());let manager=TaskManager::with_resources(resources.clone());
    let mut held=Vec::new();for _ in 0..4{let id=manager.reserve("main",request(),true).unwrap();held.push(manager.begin("main",&id).unwrap());}
    let id=manager.reserve("main",request(),true).unwrap();assert_eq!(manager.begin("main",&id).err(),Some(TaskError::Busy));
    let other=TaskManager::with_resources(resources);let id=other.reserve("main",request(),true).unwrap();assert_eq!(other.begin("main",&id).err(),Some(TaskError::Busy));
    manager.cancel_window("other");assert_eq!(manager.available_workers(),0);manager.cancel_window("main");
    assert!(manager.reserve("main",request(),true).is_err());assert_eq!(manager.available_workers(),0);
    for(lease,command)in held{drop(command);drop(lease);}manager.shutdown_wait().await.unwrap();assert_eq!(manager.available_workers(),4);
});}
#[test]
fn cancelling_unused_handle_prevents_start_and_retry_requires_new_consent_and_generation(){
    let manager=TaskManager::default();let old=manager.reserve("main",request(),true).unwrap();manager.cancel("main",&old).unwrap();manager.cancel("main",&old).unwrap();
    assert_eq!(manager.begin("main",&old).err(),Some(TaskError::Expired));assert_eq!(manager.reserve("main",request(),false).err(),Some(TaskError::ConsentRequired));
    let new=manager.reserve("main",request(),true).unwrap();assert_ne!(old,new);assert_eq!(manager.cancel("other",&new),Err(TaskError::Denied));
}
#[test]
fn abandoned_start_cannot_publish_ready_or_start_a_second_command(){runtime().block_on(async{
    let manager=Arc::new(TaskManager::default());let id=manager.reserve("main",request(),true).unwrap();let owned=manager.clone();let run_id=id.clone();
    let(entered,received)=tokio::sync::oneshot::channel();let(release,wait)=tokio::sync::oneshot::channel();
    let start=tokio::spawn(async move{owned.start_with("main",&run_id,move|lease,request,ready|async move{
        entered.send(lease.state.clone()).ok();wait.await.unwrap();drop(request);
        let(main,mut peer)=crate::legacy_socket::fixture::pair();let(secondary,mut error)=crate::legacy_socket::fixture::pair();
        actor::established(crate::rsh::RshTransport::new(main,secondary,Vec::new()),lease,Some(ready),0).await;
        use std::io::Read;assert_eq!(peer.read(&mut[0]).unwrap(),0);assert_eq!(error.read(&mut[0]).unwrap(),0);
    }).await});
    let state=received.await.unwrap();start.abort();let _=start.await;assert!(state.cancel.load(std::sync::atomic::Ordering::Acquire));
    assert_eq!(manager.available_workers(),3);let owned=manager.clone();let close_id=id.clone();let close=tokio::spawn(async move{owned.close("main",&close_id).await});
    tokio::task::yield_now().await;assert!(!close.is_finished());release.send(()).unwrap();close.await.unwrap().unwrap();assert_eq!(manager.available_workers(),4);
});}
struct Release(Option<mpsc::Sender<()>>);impl Drop for Release{fn drop(&mut self){if let Some(tx)=self.0.take(){let _=tx.send(());}}}
#[test]
fn close_and_shutdown_wait_for_issued_dns_and_forbid_a_late_dial(){
    let rt=runtime();let(tx,rx)=mpsc::channel();let mut release=Release(Some(tx));rt.block_on(async{
        let manager=Arc::new(TaskManager::default());let id=manager.reserve("main",request(),true).unwrap();let owned=manager.clone();let run_id=id.clone();let(entered,received)=mpsc::channel();
        let starting=tokio::spawn(async move{owned.start_with("main",&run_id,move|mut lease,request,ready|async move{
            let result=lease.resolve_with(move||{entered.send(()).unwrap();rx.recv().unwrap();Ok(vec![SocketAddrV4::new(Ipv4Addr::LOCALHOST,514).into()])}).await;
            assert_eq!(result,Err(SocketError::Cancelled.into()));drop(request);lease.discard=true;lease.result=(Phase::Failed,Some(SocketError::Cancelled.into()));
            let _=ready.send(Err(SocketError::Cancelled.into()));drop(lease);
        }).await});
        tokio::task::yield_now().await;received.recv_timeout(Duration::from_secs(2)).unwrap();let owned=manager.clone();
        let close=tokio::spawn(async move{owned.shutdown_wait().await});tokio::task::yield_now().await;assert!(!close.is_finished());
        assert_eq!(manager.available_workers(),3);assert_eq!(manager.handle_count(),1);release.0.take().unwrap().send(()).unwrap();
        close.await.unwrap().unwrap();assert_eq!(starting.await.unwrap(),Err(SocketError::Cancelled.into()));assert_eq!(manager.available_workers(),4);
    });
}

#[test]
fn rlogin_and_rsh_managers_share_the_actual_application_worker_quota(){runtime().block_on(async{
    let resources=Arc::new(Resources::default());let rsh=TaskManager::with_resources(resources.clone());
    let rlogin=crate::rlogin_session::SessionManager::with_resources(resources);let mut held=Vec::new();
    for _ in 0..4{let id=rsh.reserve("main",request(),true).unwrap();held.push(rsh.begin("main",&id).unwrap());}
    let id=rlogin.reserve("main",crate::rlogin_session::SessionRequest{local:Ipv4Addr::LOCALHOST,
        target:SocketAddrV4::new(Ipv4Addr::LOCALHOST,513).into(),local_user:"local".into(),remote_user:"remote".into(),
        terminal:"xterm".into(),speed:38400,window:crate::rlogin_connect::WindowSize{rows:24,columns:80,x_pixels:0,y_pixels:0},terminal_encoding:"utf-8".into()},true).unwrap();
    assert_eq!(rlogin.start("main",&id).await,Err(crate::rlogin_session::SessionError::Busy));
    assert_eq!(rsh.available_workers(),0);for(lease,command)in held{drop(command);drop(lease);}assert_eq!(rsh.available_workers(),4);
});}
