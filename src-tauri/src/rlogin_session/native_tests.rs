use super::{tests::*, *};
use crate::legacy_socket::{send_urgent_fixture, MAX_CHUNK};
use crate::rlogin::window_size_frame;
use crate::rlogin_connect::WindowSize;
use std::{io::{self, Read}, net::Shutdown};
#[test]
fn peer_eof_retains_the_final_unacknowledged_output_until_it_is_consumed() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        send(&mut session.peer,b"last\0\xff").await; session.peer.shutdown(Shutdown::Write).unwrap();
        session.state.wait_done().await.unwrap();
        let mut bytes=Vec::new(); let mut ack=None;
        loop {
            let reply=manager.read("main",&session.id,0,ack).unwrap();
            if let Some(data)=reply.frame {
                assert!(manager.read("main",&session.id,0,None).unwrap().frame.is_none());
                bytes.extend_from_slice(&data.data); ack=Some(Ack{epoch:0,sequence:data.sequence});
            } else { assert!(reply.finished); assert_eq!(reply.phase,Phase::Closed); assert_eq!(reply.reason,None); break; }
        }
        assert_eq!(bytes,b"last\0\xff");
        assert_eq!(manager.read("main",&session.id,0,None).err(),Some(SessionError::Expired));
        eof(&mut session.peer).await; session.task.await.unwrap();
    });
}
#[test]
fn slow_consumer_delivery_and_invalid_ack_do_not_bypass_output_capacity() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        let mut producer=session.peer.try_clone().unwrap();
        let producer=tokio::spawn(async move { send(&mut producer,&vec![b'x';1024*1024]).await; });
        eventually(|| (!session.state.lock().unwrap().can_read()).then_some(())).await;
        let data=frame(&manager,&session.id,0,None).await; assert_eq!(data.data,vec![b'x';data.data.len()]);
        assert!(!session.state.lock().unwrap().can_read());
        assert_eq!(manager.read("main",&session.id,0,Some(Ack{epoch:0,sequence:data.sequence+99})).err(),Some(SessionError::InvalidAck));
        assert!(!session.state.lock().unwrap().can_read());
        producer.abort(); if let Err(error)=producer.await { assert!(error.is_cancelled()); }
        manager.close("main",&session.id).await.unwrap(); session.task.await.unwrap();
        assert_eq!(manager.available_workers(),4);
        // 主动关闭仍有未读数据的TCP可以给对端EOF或reset，均证明不再保留连接。
        eventually(|| match session.peer.read(&mut [0_u8;1]) {
            Ok(0)=>Some(()), Ok(_)=>panic!("unexpected outbound bytes"),
            Err(e) if matches!(e.kind(),io::ErrorKind::ConnectionReset|io::ErrorKind::ConnectionAborted)=>Some(()),
            Err(e) if matches!(e.kind(),io::ErrorKind::WouldBlock|io::ErrorKind::Interrupted)=>None,
            Err(e)=>panic!("fixture close failed: {e}"),
        }).await;
    });
}
#[test]
fn native_actor_preserves_raw_input_window_negotiation_and_paused_urgent_control() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        manager.resize("main",&session.id,WindowSize {rows:33,columns:100,x_pixels:0,y_pixels:0}).unwrap();
        eventually(|| session.state.lock().unwrap().resize.is_none().then_some(())).await;
        assert_eq!(session.peer.read(&mut [0_u8;1]).unwrap_err().kind(),io::ErrorKind::WouldBlock);
        send_urgent_fixture(&session.peer,0x80);
        assert_eq!(receive(&mut session.peer,12).await,window_size_frame(33,100,0,0).unwrap());
        manager.write("main",&session.id,b"~.\0\xff\x80").unwrap(); assert_eq!(receive(&mut session.peer,5).await,b"~.\0\xff\x80");
        manager.write("main",&session.id,&[0x13,b'?']).unwrap(); assert_eq!(receive(&mut session.peer,1).await,b"?");
        send(&mut session.peer,b"held").await; send_urgent_fixture(&session.peer,0x80);
        send(&mut session.peer,b"tail").await;
        assert_eq!(receive(&mut session.peer,12).await,window_size_frame(33,100,0,0).unwrap());
        manager.write("main",&session.id,b"B").unwrap(); assert_eq!(receive(&mut session.peer,1).await,b"B");
        assert!(manager.read("main",&session.id,0,None).unwrap().frame.is_none(),"local pause still emitted data");
        manager.write("main",&session.id,&[0x11,b'!']).unwrap(); assert_eq!(receive(&mut session.peer,1).await,b"!");
        // 消费OOB不一定推进普通TCP游标；读完mark后的tail，才能要求关闭时干净EOF。
        let mut bytes=Vec::new(); let mut ack=None;
        eventually(|| {
            if let Some(data)=manager.read("main",&session.id,0,ack).unwrap().frame {
                bytes.extend_from_slice(&data.data); ack=Some(Ack{epoch:data.epoch,sequence:data.sequence});
            }
            (bytes.len()>=8).then_some(())
        }).await;
        assert_eq!(bytes,b"heldtail");
        manager.close("main",&session.id).await.unwrap(); eof(&mut session.peer).await; session.task.await.unwrap();
    });
}
#[test]
fn large_queued_input_is_written_in_order_and_close_releases_the_actual_socket() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await; let mut expected=Vec::new();
        for index in 0..16 { let block=vec![b'A'+index;MAX_CHUNK]; manager.write("main",&session.id,&block).unwrap(); expected.extend_from_slice(&block); }
        assert_eq!(receive(&mut session.peer,expected.len()).await,expected);
        manager.close("main",&session.id).await.unwrap(); eof(&mut session.peer).await; session.task.await.unwrap();
        assert_eq!(manager.available_workers(),4);
    });
}
#[cfg(unix)]
#[test]
fn native_flush_epoch_discards_queued_old_data_but_waits_for_its_delivered_frame_ack() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut session=fixture(&manager).await;
        send(&mut session.peer,b"delivered").await; let old=frame(&manager,&session.id,0,None).await; assert_eq!(old.data,b"delivered");
        send(&mut session.peer,b"queued-old").await; send_urgent_fixture(&session.peer,0x02); send(&mut session.peer,b"kept").await;
        let reset=eventually(|| { let reply=manager.read("main",&session.id,0,None).unwrap(); reply.requires_reset.then_some(reply) }).await;
        assert_eq!(reset.epoch,1); assert!(reset.frame.is_none() && reset.awaiting_ack);
        assert!(manager.read("main",&session.id,1,None).unwrap().frame.is_none());
        let new=frame(&manager,&session.id,1,Some(Ack{epoch:old.epoch,sequence:old.sequence})).await;
        assert_eq!(new.data,b"kept"); assert_ne!(new.sequence,old.sequence);
        let stale=manager.read("main",&session.id,1,Some(Ack{epoch:old.epoch,sequence:old.sequence})).unwrap();
        assert!(stale.frame.is_none() && stale.awaiting_ack);
        manager.close("main",&session.id).await.unwrap(); eof(&mut session.peer).await; session.task.await.unwrap();
    });
}
