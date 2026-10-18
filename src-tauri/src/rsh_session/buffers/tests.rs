use super::*;
fn ready()->Queues{let mut q=Queues::new();q.phase=Phase::InitialExchangeReady;q}
#[test]
fn flight_credit_is_exact_nonrepeating_and_never_freed_by_status_or_invalid_ack(){
    let mut q=ready();q.push_output(Stream::Stdout,b"out").unwrap();q.push_output(Stream::Stderr,b"err").unwrap();
    let first=q.read(None,false).unwrap().frame.unwrap();assert_eq!(first.stream,Stream::Stdout);
    assert!(q.read(None,false).unwrap().frame.is_none());assert_eq!(q.output[0].bytes,3);
    assert!(q.status(false).awaiting_ack);assert_eq!(q.read(Some(first.sequence+1),false).err(),Some(TaskError::InvalidAck));
    let second=q.read(Some(first.sequence),false).unwrap().frame.unwrap();assert_eq!(second.stream,Stream::Stderr);
    assert_eq!(q.output[0].bytes,0);assert_eq!(q.output[1].bytes,3);
    assert!(q.read(Some(first.sequence),false).unwrap().frame.is_none());assert_eq!(q.output[1].bytes,3);
    assert!(q.read(Some(second.sequence),true).unwrap().status.finished);
}
#[test]
fn byte_and_item_limits_include_flight_and_current_input_until_actual_write_completion(){
    let mut q=ready();let bytes=vec![1;MAX_CHUNK];
    while q.can_read(Stream::Stdout){q.push_output(Stream::Stdout,&bytes).unwrap();}
    let used=q.output[0].bytes;assert!(used+3*MAX_CHUNK<=BYTE_BUDGET);
    let frame=q.read(None,false).unwrap().frame.unwrap();assert!(!q.can_read(Stream::Stdout));assert_eq!(q.output[0].bytes,used);
    assert!(q.can_read(Stream::Stderr));q.read(Some(frame.sequence),false).unwrap();assert!(q.can_read(Stream::Stdout));
    let mut q=ready();for _ in 0..ITEMS{q.write(b"x").unwrap();}let current=q.take_input().unwrap();
    assert_eq!(q.write(b"y"),Err(TaskError::Busy));q.input_complete(current.len()).unwrap();q.write(b"z").unwrap();
}
#[test]
fn eof_is_after_all_accepted_input_and_signals_have_an_independent_bounded_fifo(){
    let mut q=ready();q.write(b"first").unwrap();q.write(b"second").unwrap();q.close_stdin().unwrap();q.close_stdin().unwrap();
    assert_eq!(q.write(b"late"),Err(TaskError::StdinClosed));assert!(!q.eof_ready());
    let first=q.take_input().unwrap();q.input_complete(first.len()).unwrap();assert!(!q.eof_ready());
    let second=q.take_input().unwrap();assert!(!q.eof_ready());q.input_complete(second.len()).unwrap();assert!(q.eof_ready());
    for _ in 0..ITEMS{q.signal(Signal::Interrupt).unwrap();}assert_eq!(q.signal(Signal::Kill),Err(TaskError::Busy));
    assert_eq!(q.signals.pop_front(),Some(Signal::Interrupt));q.signal(Signal::Kill).unwrap();
}
#[test]
fn both_streams_have_fair_delivery_and_eof_without_remote_exit_inference(){
    let mut q=ready();for _ in 0..4{q.push_output(Stream::Stdout,b"o").unwrap();q.push_output(Stream::Stderr,b"e").unwrap();}
    let mut ack=None;for stream in [Stream::Stdout,Stream::Stderr].into_iter().cycle().take(8){
        let frame=q.read(ack,false).unwrap().frame.unwrap();assert_eq!(frame.stream,stream);ack=Some(frame.sequence);
    }
    q.output_eof=[true,true];q.finish(Phase::Closed,None);let end=q.read(ack,true).unwrap();
    assert_eq!(end.status.phase,Phase::Closed);assert_eq!(end.status.reason,None);assert!(end.status.finished);
}
