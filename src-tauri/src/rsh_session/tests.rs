use super::*;
use crate::{legacy_socket::{fixture::pair,MAX_CHUNK},rsh::{RshTransport,Signal}};
use std::{io::{self,Read,Write},net::{Ipv4Addr,SocketAddrV4,TcpStream,Shutdown},time::{Duration,Instant}};
use tokio::sync::oneshot;
pub(super) fn request()->TaskRequest{TaskRequest{local:Ipv4Addr::LOCALHOST,target:SocketAddrV4::new(Ipv4Addr::LOCALHOST,514).into(),
    local_user:"local".into(),remote_user:"remote".into(),command:b" echo exact\n".to_vec(),encoding:"utf-8".into(),run_timeout_seconds:0}}
pub(super) fn runtime()->tokio::runtime::Runtime{tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()}
pub(super) async fn eventually<T>(mut f:impl FnMut()->Option<T>)->T{let end=Instant::now()+Duration::from_secs(5);loop{
    if let Some(value)=f(){return value;}assert!(Instant::now()<end,"Rsh task fixture timed out");tokio::time::sleep(Duration::from_millis(2)).await;
}}
pub(super) struct Fixture{pub id:String,pub state:Arc<Shared>,pub main:TcpStream,pub secondary:TcpStream,pub task:tokio::task::JoinHandle<()>}
pub(super) async fn fixture(manager:&TaskManager,timeout:u32)->Fixture{
    let id=manager.reserve("main",request(),true).unwrap();let(lease,_)=manager.begin("main",&id).unwrap();let state=lease.state.clone();
    let(main,peer)=pair();let(secondary,error)=pair();peer.set_nonblocking(true).unwrap();error.set_nonblocking(true).unwrap();
    let(ready,receive)=oneshot::channel();let task=tokio::spawn(actor::established(RshTransport::new(main,secondary,b"prefix".to_vec()),lease,Some(ready),timeout));
    receive.await.unwrap().unwrap();Fixture{id,state,main:peer,secondary:error,task}
}
pub(super) async fn send(peer:&mut TcpStream,bytes:&[u8]){let mut offset=0;eventually(||{match peer.write(&bytes[offset..]){
    Ok(0)=>panic!("zero write"),Ok(n)=>offset+=n,Err(e)if e.kind()==io::ErrorKind::WouldBlock=>{},Err(e)=>panic!("write {e}"),
}(offset==bytes.len()).then_some(())}).await;}
pub(super) async fn receive(peer:&mut TcpStream,length:usize)->Vec<u8>{let mut bytes=Vec::new();eventually(||{
    let mut buffer=[0;MAX_CHUNK];let room=(length-bytes.len()).min(buffer.len());match peer.read(&mut buffer[..room]){
        Ok(0)=>panic!("early EOF"),Ok(n)=>bytes.extend_from_slice(&buffer[..n]),Err(e)if e.kind()==io::ErrorKind::WouldBlock=>{},Err(e)=>panic!("read {e}"),
    }(bytes.len()==length).then_some(())}).await;bytes}
pub(super) async fn eof(peer:&mut TcpStream){eventually(||match peer.read(&mut[0;1]){
    Ok(0)=>Some(()),Ok(_)=>panic!("unexpected input"),Err(e)if e.kind()==io::ErrorKind::WouldBlock=>None,
    Err(e)if matches!(e.kind(),io::ErrorKind::ConnectionReset|io::ErrorKind::ConnectionAborted)=>Some(()),Err(e)=>panic!("EOF {e}"),
}).await;}
#[test]
fn exact_raw_command_consent_owner_expiry_single_use_and_handle_cap(){
    let manager=TaskManager::default();assert_eq!(manager.reserve("other",request(),true).err(),Some(TaskError::Denied));
    assert_eq!(manager.reserve("main",request(),false).err(),Some(TaskError::ConsentRequired));
    let mut bad=request();bad.command=b"private\0command".to_vec();assert!(manager.reserve("main",bad,true).is_err());assert_eq!(manager.handle_count(),0);
    let id=manager.reserve("main",request(),true).unwrap();manager.expire(&id);assert_eq!(manager.begin("main",&id).err(),Some(TaskError::Expired));
    let id=manager.reserve("main",request(),true).unwrap();let(lease,frozen)=manager.begin("main",&id).unwrap();assert_eq!(frozen.command,b" echo exact\n");
    assert_eq!(manager.begin("main",&id).err(),Some(TaskError::Duplicate));drop(frozen);drop(lease);
    for _ in manager.handle_count()..16{manager.reserve("main",request(),true).unwrap();}assert_eq!(manager.reserve("main",request(),true).err(),Some(TaskError::Busy));
}
#[test]
fn input_eof_signals_and_independent_binary_output_use_actual_two_sockets(){runtime().block_on(async{
    let manager=TaskManager::default();let mut run=fixture(&manager,0).await;
    manager.write("main",&run.id,b"one\0\xff").unwrap();manager.write("main",&run.id,b"two").unwrap();manager.close_stdin("main",&run.id).unwrap();
    assert_eq!(manager.write("main",&run.id,b"late"),Err(TaskError::StdinClosed));
    for signal in [Signal::Hangup,Signal::Interrupt,Signal::Quit,Signal::Kill,Signal::Terminate]{manager.signal("main",&run.id,signal).unwrap();}
    assert_eq!(receive(&mut run.main,8).await,b"one\0\xfftwo");eof(&mut run.main).await;assert_eq!(receive(&mut run.secondary,5).await,[1,2,3,9,15]);
    send(&mut run.main,b"stdout\0\xff").await;run.main.shutdown(Shutdown::Write).unwrap();
    eventually(||manager.status("main",&run.id).unwrap().stdout_eof.then_some(())).await;
    assert!(!manager.status("main",&run.id).unwrap().stderr_eof);
    send(&mut run.secondary,b"\0\xfflate stderr").await;run.secondary.shutdown(Shutdown::Write).unwrap();
    run.state.wait_done().await.unwrap();let mut out=Vec::new();let mut err=Vec::new();let mut ack=None;
    loop{let reply=manager.read("main",&run.id,ack.take()).unwrap();if let Some(frame)=reply.frame{
        if frame.stream==Stream::Stdout{out.extend_from_slice(&frame.data);}else{err.extend_from_slice(&frame.data);}ack=Some(frame.sequence);
    }if reply.status.finished{assert_eq!(reply.status.phase,Phase::Closed);assert_eq!(reply.status.reason,None);break;}}
    assert_eq!(out,b"prefixstdout\0\xff");assert_eq!(err,b"\0\xfflate stderr");run.task.await.unwrap();assert_eq!(manager.available_workers(),4);
});}
#[test]
fn saturated_stdout_does_not_starve_stderr_input_signals_or_cancellation(){runtime().block_on(async{
    let manager=TaskManager::default();let mut run=fixture(&manager,0).await;
    send(&mut run.main,&vec![b'x';1024*1024]).await;
    eventually(||(!run.state.lock().unwrap().can_read(Stream::Stdout)).then_some(())).await;
    send(&mut run.secondary,b"independent tail").await;run.secondary.shutdown(Shutdown::Write).unwrap();
    eventually(||manager.status("main",&run.id).unwrap().stderr_eof.then_some(())).await;
    manager.write_text("main",&run.id,"stdin").unwrap();manager.close_stdin("main",&run.id).unwrap();manager.signal("main",&run.id,Signal::Interrupt).unwrap();
    assert_eq!(receive(&mut run.main,5).await,b"stdin");eof(&mut run.main).await;assert_eq!(receive(&mut run.secondary,1).await,[2]);
    manager.close("main",&run.id).await.unwrap();eof(&mut run.secondary).await;run.task.await.unwrap();assert_eq!(manager.available_workers(),4);
});}
#[test]
fn status_never_consumes_a_frame_or_removes_a_completed_tail(){runtime().block_on(async{
    let manager=TaskManager::default();let mut run=fixture(&manager,0).await;run.main.shutdown(Shutdown::Write).unwrap();run.secondary.shutdown(Shutdown::Write).unwrap();
    run.state.wait_done().await.unwrap();for _ in 0..4{assert!(!manager.status("main",&run.id).unwrap().finished);}
    let frame=manager.read("main",&run.id,None).unwrap().frame.unwrap();assert_eq!(frame.data,b"prefix");
    assert!(manager.read("main",&run.id,None).unwrap().frame.is_none());assert!(manager.read("main",&run.id,Some(frame.sequence)).unwrap().status.finished);
    assert_eq!(manager.handle_count(),0);eof(&mut run.main).await;eof(&mut run.secondary).await;run.task.await.unwrap();
});}
#[test]
fn explicit_runtime_timeout_is_separate_from_establishment_and_releases_both_sockets(){runtime().block_on(async{
    let manager=TaskManager::default();let mut run=fixture(&manager,1).await;run.state.wait_done().await.unwrap();
    assert_eq!(manager.status("main",&run.id).unwrap().reason,Some(TaskError::RunTimeout));eof(&mut run.main).await;eof(&mut run.secondary).await;
    manager.close("main",&run.id).await.unwrap();run.task.await.unwrap();
});}
