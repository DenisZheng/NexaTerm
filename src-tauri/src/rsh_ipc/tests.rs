use super::*;
use serde_json::{json,Value};
fn payload()->Value{json!({"local_address":"127.0.0.1","target_address":"Example.invalid.","port":514,"local_user":"local","remote_user":"remote",
    "command":" echo exact\n","encoding":"utf-8","run_timeout_seconds":0,"allow_plaintext":true})}
fn request()->ReserveRequest{serde_json::from_value(payload()).unwrap()}
#[test]
fn consent_actual_owner_strict_fields_and_exact_command_are_enforced_without_io(){
    let manager=TaskManager::default();assert_eq!(Boundary::new("runner",&manager).err().map(|e|e.code()),Some("rsh_task_denied"));
    assert_eq!(capability("runner").err(),Some(TaskError::Denied));assert!(capability("main").unwrap().runtime_available);
    let boundary=Boundary::new("main",&manager).unwrap();let mut absent=request();absent.allow_plaintext=false;assert_eq!(boundary.reserve(absent),Err(TaskError::ConsentRequired));
    let core=request().into_core().unwrap();assert_eq!(core.command,b" echo exact\n");
    let mut unknown=payload();unknown["owner"]=json!("main");assert!(serde_json::from_value::<ReserveRequest>(unknown).is_err());
    let id=boundary.reserve(request()).unwrap();assert!(crate::legacy_ipc::id(&id));boundary.cancel(&id).unwrap();
}
#[test]
fn strict_encoding_bounds_timeout_and_plaintext_fields_cannot_be_overridden_at_start(){
    let manager=TaskManager::default();let boundary=Boundary::new("main",&manager).unwrap();
    for(key,value)in [("encoding",json!("unknown")),("command",json!("bad\0command")),("run_timeout_seconds",json!(86401)),("target_address",json!("https://host")),("local_address",json!("localhost"))]{
        let mut input=payload();input[key]=value;assert!(boundary.reserve(serde_json::from_value(input).unwrap()).is_err());
    }
    let mut encoded=request();encoded.encoding="gbk".into();encoded.command="中".into();assert_eq!(encoded.into_core().unwrap().command,[0xd6,0xd0]);
    let mut lossy=request();lossy.encoding="gbk".into();lossy.command="🦀".into();assert_eq!(lossy.into_core().err(),Some(TaskError::EncodingFailed));
    let mut cap=request();cap.command="x".repeat(65536);assert_eq!(cap.into_core().unwrap().command.len(),65536);
    let mut large=request();large.command="x".repeat(65537);assert_eq!(large.into_core().err(),Some(TaskError::InvalidChunk));
}
#[test]
fn exact_decimal_sequence_and_signal_whitelist_are_host_independent(){
    for text in ["0","1","9007199254740993","18446744073709551615"]{let value=crate::legacy_ipc::counter(text).unwrap();assert_eq!(value.to_string(),text);}
    for text in ["","01","+1","-1"," 1","1.0","18446744073709551616"]{assert!(crate::legacy_ipc::counter(text).is_none());}
    for (name,byte) in [("hangup",1),("interrupt",2),("quit",3),("kill",9),("terminate",15)]{
        let signal:SignalRequest=serde_json::from_value(json!({"reservation_id":"irrelevant","signal":name})).unwrap();
        assert_eq!(crate::rsh::Signal::from(signal.signal).encode(),[byte]);
    }
    for signal in [json!(2),json!("SIGINT"),json!("stop")]{assert!(serde_json::from_value::<SignalRequest>(json!({"reservation_id":"x","signal":signal})).is_err());}
}
#[test]
fn status_and_frames_never_invent_an_exit_code_or_lose_a_u64_sequence(){
    use crate::rsh_session::*;
    let status=TaskStatus{phase:Phase::Closed,reason:None,stdin_eof:true,stdout_eof:true,stderr_eof:true,awaiting_ack:true,finished:false};
    let dto:ReadReplyDto=ReadReply{status,frame:Some(OutputFrame{sequence:u64::MAX,stream:Stream::Stderr,data:vec![0,255]})}.into();
    let json=serde_json::to_value(dto).unwrap();assert_eq!(json["status"]["remote_exit_code"],Value::Null);
    assert_eq!(json["frame"]["sequence"],"18446744073709551615");assert_eq!(json["frame"]["stream"],"stderr");assert_eq!(json["frame"]["data"],json!([0,255]));
}
