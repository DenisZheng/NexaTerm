use super::{buffers::{Queues, INPUT_LIMIT, OUTPUT_LIMIT, ITEM_LIMIT}, Ack, Phase, SessionError};
use crate::legacy_socket::MAX_CHUNK;
fn ready() -> Queues { let mut q = Queues::new(); q.phase = Phase::InitialExchangeReady; q }
#[test]
fn dequeued_and_partial_input_keeps_byte_credit_until_actual_completion() {
    let mut q = ready(); let block = vec![b'x'; MAX_CHUNK]; let mut total = 0;
    while total + MAX_CHUNK <= INPUT_LIMIT { q.write(&block).unwrap(); total += MAX_CHUNK; }
    q.write(&block[..INPUT_LIMIT-total]).unwrap();
    assert_eq!(q.write(b"!"), Err(SessionError::Busy));
    let current = q.take_input().unwrap();
    assert_eq!(q.write(b"!"), Err(SessionError::Busy), "dequeue freed credit before a partial write finished");
    assert_eq!(&current[..8], b"xxxxxxxx");
    q.input_complete(current.len()).unwrap(); q.write(b"!").unwrap();
    assert_eq!(q.write(&vec![0;MAX_CHUNK+1]), Err(SessionError::InvalidChunk));
}
#[test]
fn tiny_and_empty_inputs_cannot_create_an_unbounded_item_queue() {
    let mut q = ready();
    for _ in 0..ITEM_LIMIT { q.write(b"x").unwrap(); }
    for _ in 0..100 { q.write(&[]).unwrap(); }
    assert_eq!(q.write(b"y"), Err(SessionError::Busy));
    let current = q.take_input().unwrap(); assert_eq!(q.write(b"y"), Err(SessionError::Busy));
    q.input_complete(current.len()).unwrap(); q.write(b"y").unwrap();
}
#[test]
fn output_delivery_keeps_credit_and_only_exact_ack_can_release_its_own_frame() {
    let mut q = ready(); let block = vec![b'a';MAX_CHUNK];
    for _ in 0..OUTPUT_LIMIT/MAX_CHUNK { q.push_output(&block).unwrap(); }
    assert!(!q.can_read());
    let first = q.read(0,None,false).unwrap().frame.unwrap();
    assert_eq!(first.data, block); assert!(!q.can_read());
    let waiting = q.read(0,None,false).unwrap(); assert!(waiting.frame.is_none() && waiting.awaiting_ack);
    assert_eq!(q.read(0,Some(Ack { epoch:0,sequence:first.sequence+99 }),false).err(), Some(SessionError::InvalidAck));
    assert!(!q.can_read());
    let old_ack = Ack { epoch:first.epoch,sequence:first.sequence };
    let second = q.read(0,Some(old_ack),false).unwrap().frame.unwrap();
    assert_ne!(second.sequence, first.sequence); assert!(q.can_read());
    let duplicate = q.read(0,Some(old_ack),false).unwrap();
    assert!(duplicate.awaiting_ack && duplicate.frame.is_none(), "duplicate ACK consumed the newer frame");
}
#[test]
fn flush_epoch_preserves_outstanding_credit_and_never_replays_or_discards_the_next_frame() {
    let mut q = ready(); q.push_output(b"delivered").unwrap(); q.push_output(b"queued-old").unwrap();
    let old = q.read(0,None,false).unwrap().frame.unwrap(); q.flush().unwrap(); q.push_output(b"post-mark").unwrap();
    let reset = q.read(0,None,false).unwrap(); assert!(reset.requires_reset && reset.frame.is_none() && reset.awaiting_ack);
    assert_eq!(reset.epoch,1);
    assert!(q.read(1,None,false).unwrap().frame.is_none());
    let ack = Ack { epoch:old.epoch,sequence:old.sequence };
    let new = q.read(1,Some(ack),false).unwrap().frame.unwrap(); assert_eq!(new.data,b"post-mark");
    assert_eq!(new.epoch,1); assert_ne!(new.sequence,old.sequence);
    assert!(q.read(1,Some(ack),false).unwrap().awaiting_ack);
    q.finish(Phase::Closed,None);
    assert!(q.read(1,Some(Ack { epoch:1,sequence:new.sequence }),true).unwrap().finished);
    assert_eq!(q.read(2,None,true).err(),Some(SessionError::InvalidAck));
}
