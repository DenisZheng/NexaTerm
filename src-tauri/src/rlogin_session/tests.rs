use super::*;
use crate::legacy_socket::{fixture::pair, SocketError};
use crate::rlogin_connect::WindowSize;
use crate::rlogin_native::RloginReader;
use std::{io::{self, Read, Write}, net::{Ipv4Addr, SocketAddrV4, TcpStream}, time::{Duration, Instant}};
use tokio::sync::oneshot;
pub(super) fn request() -> SessionRequest {
    SessionRequest { local: Ipv4Addr::LOCALHOST, target: SocketAddrV4::new(Ipv4Addr::LOCALHOST,513),
        local_user:"local".into(), remote_user:"remote".into(), terminal:"xterm".into(), speed:38400,
        window:WindowSize { rows:24,columns:80,x_pixels:0,y_pixels:0 } }
}
pub(super) fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
pub(super) async fn eventually<T>(mut operation: impl FnMut() -> Option<T>) -> T {
    let deadline=Instant::now()+Duration::from_secs(4);
    loop { if let Some(value)=operation() { return value; } assert!(Instant::now()<deadline,"session fixture did not progress");
        tokio::time::sleep(Duration::from_millis(2)).await; }
}
pub(super) struct Fixture { pub id:String, pub state:Arc<Shared>, pub peer:TcpStream, pub task:tokio::task::JoinHandle<()> }
pub(super) async fn fixture(manager:&SessionManager) -> Fixture {
    let id=manager.reserve("main",request(),true).unwrap(); let (lease,_)=manager.begin("main",&id).unwrap();
    let state=lease.state.clone(); let (socket,peer)=pair(); peer.set_nonblocking(true).unwrap();
    let reader=RloginReader::new(socket,24,80,0,0).unwrap(); let (ready,received)=oneshot::channel();
    let task=tokio::spawn(actor::established(reader,lease,Some(ready))); received.await.unwrap().unwrap();
    Fixture {id,state,peer,task}
}
pub(super) async fn send(peer:&mut TcpStream,bytes:&[u8]) {
    let mut offset=0;
    eventually(|| {
        if offset==bytes.len() { return Some(()); }
        match peer.write(&bytes[offset..]) {
            Ok(0)=>panic!("fixture write made no progress"), Ok(n)=>offset+=n,
            Err(e) if matches!(e.kind(),io::ErrorKind::WouldBlock|io::ErrorKind::Interrupted)=>{}, Err(e)=>panic!("fixture write failed: {e}"),
        } (offset==bytes.len()).then_some(())
    }).await;
}
pub(super) async fn receive(peer:&mut TcpStream,length:usize)->Vec<u8> {
    let mut bytes=Vec::new(); let mut buffer=[0_u8;8192];
    eventually(|| {
        let room=(length-bytes.len()).min(buffer.len());
        match peer.read(&mut buffer[..room]) {
            Ok(0)=>panic!("fixture reached EOF before expected bytes"), Ok(n)=>bytes.extend_from_slice(&buffer[..n]),
            Err(e) if matches!(e.kind(),io::ErrorKind::WouldBlock|io::ErrorKind::Interrupted)=>{}, Err(e)=>panic!("fixture read failed: {e}"),
        } (bytes.len()==length).then_some(())
    }).await; bytes
}
pub(super) async fn eof(peer:&mut TcpStream) {
    eventually(|| match peer.read(&mut [0_u8;1]) {
        Ok(0)=>Some(()), Ok(_)=>panic!("unexpected outgoing fixture bytes"),
        Err(e) if matches!(e.kind(),io::ErrorKind::WouldBlock|io::ErrorKind::Interrupted)=>None, Err(e)=>panic!("fixture EOF failed: {e}"),
    }).await;
}
pub(super) async fn frame(manager:&SessionManager,id:&str,epoch:u64,ack:Option<Ack>)->OutputFrame {
    eventually(|| manager.read("main",id,epoch,ack).unwrap().frame).await
}
#[test]
fn owner_consent_validation_expiry_and_single_use_have_no_network_side_effects() {
    let manager=SessionManager::default();
    assert_eq!(manager.reserve("other",request(),true).err(),Some(SessionError::Denied));
    assert_eq!(manager.reserve("main",request(),false).err(),Some(SessionError::ConsentRequired));
    let mut invalid=request(); invalid.remote_user="x".repeat(31);
    assert_eq!(manager.reserve("main",invalid,true).err(),Some(SessionError::Connect(crate::rlogin::ProtocolError::InvalidUser.into())));
    assert_eq!(manager.handle_count(),0);
    let id=manager.reserve("main",request(),true).unwrap(); manager.expire(&id);
    assert_eq!(manager.begin("main",&id).err(),Some(SessionError::Expired));
    let id=manager.reserve("main",request(),true).unwrap();
    assert_eq!(manager.begin("other",&id).err(),Some(SessionError::Denied));
    let (lease,_) = manager.begin("main",&id).unwrap();
    assert_eq!(manager.begin("main",&id).err(),Some(SessionError::Duplicate));
    drop(lease); assert_eq!(manager.available_workers(),4);
    manager.cancel("main",&id).unwrap();
    for _ in manager.handle_count()..16 { manager.reserve("main",request(),true).unwrap(); }
    assert_eq!(manager.reserve("main",request(),true).err(),Some(SessionError::Busy));
}
#[test]
fn cancelling_an_unused_reservation_is_idempotent_and_retry_has_a_new_generation() {
    let manager=SessionManager::default(); let old=manager.reserve("main",request(),true).unwrap();
    assert_eq!(manager.cancel("other",&old),Err(SessionError::Denied)); manager.cancel("main",&old).unwrap(); manager.cancel("main",&old).unwrap();
    assert_eq!(manager.begin("main",&old).err(),Some(SessionError::Expired));
    let new=manager.reserve("main",request(),true).unwrap(); assert_ne!(old,new);
    assert_eq!(manager.write("main",&old,b"x"),Err(SessionError::Expired));
    assert_eq!(manager.write("main",&new,b"x"),Err(SessionError::NotReady));
    manager.shutdown(); assert_eq!(manager.handle_count(),0);
    assert_eq!(manager.reserve("main",request(),true).err(),Some(SessionError::Unavailable));
}
#[test]
fn four_real_workers_keep_capacity_until_their_actual_owned_sockets_end() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut sessions=Vec::new();
        for _ in 0..4 { sessions.push(fixture(&manager).await); }
        assert_eq!(manager.available_workers(),0);
        let fifth=manager.reserve("main",request(),true).unwrap();
        assert_eq!(manager.start("main",&fifth).await,Err(SessionError::Busy));
        manager.cancel("main",&sessions[0].id).unwrap(); assert_eq!(manager.available_workers(),0,"cancel freed a live worker permit");
        manager.close("main",&sessions[0].id).await.unwrap(); assert_eq!(manager.available_workers(),1); eof(&mut sessions[0].peer).await;
        for mut session in sessions { manager.close("main",&session.id).await.unwrap(); eof(&mut session.peer).await; session.task.await.unwrap(); }
        assert_eq!(manager.available_workers(),4); assert_eq!(manager.handle_count(),0);
    });
}
#[test]
fn abandoned_start_and_close_wait_for_the_still_owned_worker_instead_of_releasing_its_quota() {
    runtime().block_on(async {
        let manager=Arc::new(SessionManager::default()); let id=manager.reserve("main",request(),true).unwrap();
        let (socket,mut peer)=pair(); peer.set_nonblocking(true).unwrap(); let reader=RloginReader::new(socket,24,80,0,0).unwrap();
        let (entered,started)=oneshot::channel(); let (release,released)=oneshot::channel(); let copy=manager.clone(); let target=id.clone();
        let caller=tokio::spawn(async move {
            copy.start_with("main",&target,move |lease,request,ready| async move {
                drop(request); entered.send(()).unwrap(); released.await.unwrap(); actor::established(reader,lease,Some(ready)).await;
            }).await
        });
        started.await.unwrap(); caller.abort(); assert!(caller.await.unwrap_err().is_cancelled());
        assert_eq!(manager.available_workers(),3); assert_eq!(manager.handle_count(),1);
        assert_eq!(peer.read(&mut [0_u8;1]).unwrap_err().kind(),io::ErrorKind::WouldBlock);
        let copy=manager.clone(); let target=id.clone(); let closer=tokio::spawn(async move { copy.close("main",&target).await });
        tokio::task::yield_now().await; assert!(!closer.is_finished()); assert_eq!(manager.available_workers(),3);
        release.send(()).unwrap(); closer.await.unwrap().unwrap(); eof(&mut peer).await;
        assert_eq!(manager.available_workers(),4); assert_eq!(manager.handle_count(),0);
    });
}
#[test]
fn actual_actor_abort_and_manager_drop_close_fds_without_inventing_success() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        session.task.abort(); assert!(session.task.await.unwrap_err().is_cancelled()); session.state.wait_done().await.unwrap();
        eof(&mut session.peer).await; assert_eq!(manager.available_workers(),4);
        let status=manager.read("main",&session.id,0,None).unwrap(); assert_eq!(status.phase,Phase::Failed); assert_eq!(status.reason,Some(SessionError::Unavailable));
        let mut session=fixture(&manager).await; drop(manager);
        session.state.wait_done().await.unwrap(); eof(&mut session.peer).await; session.task.await.unwrap();
        assert!(session.state.cancel.load(Ordering::Acquire));
    });
}
#[test]
fn pre_cancelled_owned_connection_is_reported_without_session_payload_or_socket_success() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let id=manager.reserve("main",request(),true).unwrap();
        let (lease,request)=manager.begin("main",&id).unwrap(); let state=lease.state.clone(); state.cancel().unwrap();
        let (ready,received)=oneshot::channel(); actor::connect(lease,request,ready).await;
        assert_eq!(received.await.unwrap(),Err(SocketError::Cancelled.into())); state.wait_done().await.unwrap();
        assert_eq!(manager.available_workers(),4); assert_eq!(manager.handle_count(),0);
    });
}
