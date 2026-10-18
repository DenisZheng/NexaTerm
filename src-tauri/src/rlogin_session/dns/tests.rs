use super::*;
use std::{net::{Ipv4Addr, SocketAddr, SocketAddrV4}, sync::{mpsc, Arc}, time::Duration};
use crate::legacy_socket::SocketError;
fn runtime()->tokio::runtime::Runtime {tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()}
fn local(port:u16)->SocketAddr{SocketAddrV4::new(Ipv4Addr::LOCALHOST,port).into()}
struct Release(Option<mpsc::Sender<()>>);
impl Release {fn release(&mut self){if let Some(send)=self.0.take(){let _=send.send(());}}}
impl Drop for Release {fn drop(&mut self){self.release();}}

#[test]
fn actual_session_close_waits_gated_dns_and_keeps_its_handle_until_real_cleanup() {
    use super::super::{tests::request, SessionManager, Phase};
    let rt=runtime();let (release,wait)=mpsc::channel();let mut release=Release(Some(release));
    rt.block_on(async {
        let manager=Arc::new(SessionManager::default());let mut request=request();request.target=Destination::parse("Example.invalid.",513).unwrap();
        let id=manager.reserve("main",request,true).unwrap();let owned=manager.clone();let run_id=id.clone();let (started,entered)=mpsc::channel();
        let run=tokio::spawn(async move {owned.start_with("main",&run_id,move |mut lease,_request,ready| async move {
            let resolver=Resolver::default();
            let result=resolver.resolve_with(&lease.state.cancel,lease.deadline,move ||{started.send(()).unwrap();wait.recv().unwrap();Ok(vec![local(513)])}).await;
            assert_eq!(result,Err(SocketError::Cancelled.into()));
            lease.result=(Phase::Failed,Some(SocketError::Cancelled.into()));lease.discard=true;let _=ready.send(Err(SocketError::Cancelled.into()));
        }).await});
        tokio::task::yield_now().await;entered.recv_timeout(Duration::from_secs(2)).unwrap();
        let owned=manager.clone();let close_id=id.clone();let closing=tokio::spawn(async move {owned.close("main",&close_id).await});
        tokio::task::yield_now().await;assert!(!closing.is_finished());assert_eq!(manager.handle_count(),1);
        release.release();closing.await.unwrap().unwrap();assert_eq!(run.await.unwrap(),Err(SocketError::Cancelled.into()));assert_eq!(manager.handle_count(),0);
    });
}
