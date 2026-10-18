use super::*;
use std::{sync::mpsc, time::Duration};
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
fn signal() -> Arc<AtomicBool> { Arc::new(AtomicBool::new(false)) }
fn deadline() -> Instant { Instant::now()+Duration::from_secs(5) }
fn local(port:u16)->SocketAddr { SocketAddrV4::new(Ipv4Addr::LOCALHOST,port).into() }
#[test]
fn destination_accepts_only_explicit_ascii_names_or_canonical_ipv4() {
    for host in ["localhost","Desktop.Example.invalid.","host-1","a","1host.example"] {
        assert!(matches!(Destination::parse(host,513),Ok(Destination::Host{..})));
    }
    assert_eq!(Destination::parse("127.0.0.1",513).unwrap(),Destination::Address(SocketAddrV4::new(Ipv4Addr::LOCALHOST,513)));
    for host in ["","bad host","bad\nhost","https://host","host:513","::1","中.example","-host","host-","a..b",".","127.1","127.0.0.999","0x7f000001","0x7f.0.0.1","0127.0.0.1","0.0.0.0","224.0.0.1","255.255.255.255"] {
        assert_eq!(Destination::parse(host,513).unwrap_err(),SocketError::InvalidAddress.into());
    }
    assert!(Destination::parse("host",0).is_err());
    assert!(Destination::parse(&"a".repeat(64),513).is_err());
    assert!(Destination::parse(&format!("{}.{}.{}.{}","a".repeat(63),"b".repeat(63),"c".repeat(63),"d".repeat(62)),513).is_err());
    assert!(Destination::parse(&format!("{}.{}.{}.{}","a".repeat(63),"b".repeat(63),"c".repeat(63),"d".repeat(61)),513).is_ok());
}
#[test]
fn constructed_destinations_cannot_bypass_validation() {
    for destination in [Destination::Address(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED,513)),Destination::Address(SocketAddrV4::new(Ipv4Addr::LOCALHOST,0)),
        Destination::Host{name:"127.0.0.1".into(),port:513},Destination::Host{name:"bad host".into(),port:513}] { assert!(destination.validate().is_err()); }
}
#[test]
fn selects_one_bounded_valid_ipv4_in_os_order_without_ipv6_or_endpoint_fallback() {
    let addresses=vec!["[::1]:513".parse().unwrap(),"0.0.0.0:513".parse().unwrap(),local(513),local(513),"192.0.2.2:513".parse().unwrap()];
    assert_eq!(first_ipv4(addresses.into_iter()).unwrap(),SocketAddrV4::new(Ipv4Addr::LOCALHOST,513));
    let addresses=std::iter::repeat("[::1]:513".parse().unwrap()).take(16).chain(std::iter::once(local(513)));
    assert_eq!(first_ipv4(addresses),Err(SessionError::DnsNoIpv4));
    assert_eq!(first_ipv4(std::iter::empty()),Err(SessionError::DnsNoIpv4));
}
#[test]
fn numeric_bypasses_all_dns_capacity_but_not_cancel_or_deadline() {
    runtime().block_on(async {
        let resolver=Resolver::default();let _held=resolver.permits.clone().try_acquire_many_owned(4).unwrap();
        let numeric=Destination::parse("127.0.0.1",513).unwrap();let cancel=signal();
        assert_eq!(resolver.resolve(&numeric,&cancel,deadline()).await.unwrap(),SocketAddrV4::new(Ipv4Addr::LOCALHOST,513));
        cancel.store(true,Ordering::Release);assert_eq!(resolver.resolve(&numeric,&cancel,deadline()).await,Err(SocketError::Cancelled.into()));
        assert_eq!(resolver.resolve(&numeric,&signal(),Instant::now()).await,Err(SocketError::Timeout.into()));
    });
}
#[test]
fn actual_localhost_uses_os_resolution_without_external_dns_or_address_publication() {
    runtime().block_on(async {
        let resolver=Resolver::default();let target=Destination::parse("localhost",513).unwrap();
        assert_eq!(resolver.resolve(&target,&signal(),deadline()).await.unwrap(),SocketAddrV4::new(Ipv4Addr::LOCALHOST,513));
        assert_eq!(resolver.permits.available_permits(),4);
    });
}
#[test]
fn error_mapping_discards_os_text_and_refuses_no_ipv4() {
    runtime().block_on(async {
        let resolver=Resolver::default();
        assert_eq!(resolver.resolve_with(&signal(),deadline(),||Err(io::Error::other("private resolver fixture"))).await,Err(SessionError::DnsFailed));
        assert_eq!(SessionError::DnsFailed.code(),"rlogin_dns_failed");
        assert_eq!(resolver.resolve_with(&signal(),deadline(),||Ok(vec!["[::1]:513".parse().unwrap()])).await,Err(SessionError::DnsNoIpv4));
    });
}
struct Release(Option<mpsc::Sender<()>>);
impl Release { fn release(&mut self){if let Some(send)=self.0.take(){let _=send.send(());}} }
impl Drop for Release { fn drop(&mut self){self.release();} }
#[test]
fn cancellation_retains_real_worker_and_quota_until_return_then_rejects_late_endpoint() {
    let rt=runtime();let (release,wait)=mpsc::channel();let mut release=Release(Some(release));
    rt.block_on(async {
        let resolver=Arc::new(Resolver::default());let _held=resolver.permits.clone().try_acquire_many_owned(3).unwrap();
        let cancel=signal();let owned=resolver.clone();let worker_cancel=cancel.clone();let (started,entered)=mpsc::channel();
        let worker=tokio::spawn(async move { owned.resolve_with(&worker_cancel,deadline(),move ||{started.send(()).unwrap();wait.recv().unwrap();Ok(vec![local(513)])}).await });
        tokio::task::yield_now().await;entered.recv_timeout(Duration::from_secs(2)).unwrap();cancel.store(true,Ordering::Release);
        tokio::task::yield_now().await;assert!(!worker.is_finished());assert_eq!(resolver.permits.available_permits(),0);
        assert_eq!(resolver.resolve_with(&signal(),deadline(),||panic!("quota bypass")).await,Err(SessionError::Busy));
        release.release();assert_eq!(worker.await.unwrap(),Err(SocketError::Cancelled.into()));assert_eq!(resolver.permits.available_permits(),1);
    });
}
#[test]
fn caller_drop_does_not_release_an_issued_blocking_resolver_permit() {
    let rt=runtime();let (release,wait)=mpsc::channel();let mut release=Release(Some(release));
    rt.block_on(async {
        let resolver=Arc::new(Resolver::default());let _held=resolver.permits.clone().try_acquire_many_owned(3).unwrap();
        let owned=resolver.clone();let (started,entered)=mpsc::channel();
        let worker=tokio::spawn(async move { owned.resolve_with(&signal(),deadline(),move ||{started.send(()).unwrap();wait.recv().unwrap();Ok(vec![local(513)])}).await });
        tokio::task::yield_now().await;entered.recv_timeout(Duration::from_secs(2)).unwrap();worker.abort();let _=worker.await;
        assert_eq!(resolver.permits.available_permits(),0);release.release();
        tokio::time::timeout(Duration::from_secs(2),async {while resolver.permits.available_permits()==0 {tokio::time::sleep(Duration::from_millis(1)).await;}}).await.unwrap();
    });
}
#[test]
fn original_deadline_is_not_reset_when_blocking_resolution_finishes_late() {
    let rt=runtime();let (release,wait)=mpsc::channel();let mut release=Release(Some(release));
    rt.block_on(async {
        let resolver=Arc::new(Resolver::default());let owned=resolver.clone();let (started,entered)=mpsc::channel();
        let expires=Instant::now()+Duration::from_secs(2);
        let worker=tokio::spawn(async move { owned.resolve_with(&signal(),expires,move ||{started.send(()).unwrap();wait.recv().unwrap();Ok(vec![local(513)])}).await });
        tokio::task::yield_now().await;entered.recv_timeout(Duration::from_secs(2)).unwrap();
        tokio::time::sleep(expires.saturating_duration_since(Instant::now())+Duration::from_millis(5)).await;
        assert!(!worker.is_finished());assert_eq!(resolver.permits.available_permits(),3);release.release();
        assert_eq!(worker.await.unwrap(),Err(SocketError::Timeout.into()));assert_eq!(resolver.permits.available_permits(),4);
    });
}
#[test]
fn cancelled_before_dispatch_never_invokes_the_os_resolver() {
    runtime().block_on(async {let resolver=Resolver::default();let cancel=signal();cancel.store(true,Ordering::Release);
        assert_eq!(resolver.resolve_with(&cancel,deadline(),||panic!("cancelled resolver invoked")).await,Err(SocketError::Cancelled.into()));
        assert_eq!(resolver.permits.available_permits(),4);
    });
}

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
