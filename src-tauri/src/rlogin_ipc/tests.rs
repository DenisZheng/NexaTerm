use super::*;
use crate::{legacy_socket::SocketError, rlogin_connect::ConnectError, rlogin_session::{OutputFrame, Phase, ReadReply, SessionStatus}};
use serde_json::{json, Value};
fn request() -> Value {
    json!({"local_address":"127.0.0.1","target_address":"127.0.0.1","port":513,"local_user":"local","remote_user":"remote",
        "terminal":"xterm","speed":38400,"window":{"rows":24,"columns":80},"allow_plaintext":true})
}
fn decode(value: Value) -> ReserveRequest { serde_json::from_value(value).unwrap() }
#[test]
fn text_dto_defaults_encoding_and_refuses_target_or_encoding_overrides_on_write() {
    let (core,_)=decode(request()).into_core().unwrap(); assert_eq!(core.terminal_encoding,"utf-8");
    let mut value=request(); value["terminal_encoding"]=json!("gbk");
    assert_eq!(decode(value).into_core().unwrap().0.terminal_encoding,"gbk");
    for extra in ["terminal_encoding","owner","target_address","password"] {
        let mut value=json!({"reservation_id":"x","data":"private fixture"}); value[extra]=json!("private");
        assert!(serde_json::from_value::<WriteTextRequest>(value).is_err());
    }
    assert!(serde_json::from_value::<WriteTextRequest>(json!({"reservation_id":"x","data":[1]})).is_err());
    let data:WriteTextRequest=serde_json::from_value(json!({"reservation_id":"x","data":"\0\r中"})).unwrap();
    assert_eq!(data.data,"\0\r中");
}
#[test]
fn text_boundary_keeps_platform_and_id_checks_before_payload_processing() {
    let manager=SessionManager::default(); let b=Boundary::new("main",&manager).unwrap();
    let expected=if cfg!(windows) {SocketError::UrgentBoundaryUnavailable.into()} else {SessionError::Expired};
    assert_eq!(b.write_text(WriteTextRequest {reservation_id:"invalid".into(),data:"x".repeat(4097)}),Err(expected));
    if cfg!(unix) {
        let mut value=request(); value["terminal_encoding"]=json!("unknown");
        assert_eq!(b.reserve(decode(value)),Err(SessionError::InvalidEncoding));
        let id=b.reserve(decode(request())).unwrap();
        assert_eq!(b.write_text(WriteTextRequest {reservation_id:id.clone(),data:"x".repeat(4097)}),Err(SessionError::InvalidChunk));
        b.cancel(&id).unwrap();
    }
}
#[test]
fn capability_and_boundary_deny_foreign_labels_before_any_operation() {
    let manager=SessionManager::default();
    for label in ["","vnc-runner-host","MAIN","main\0"] {
        assert_eq!(Boundary::new(label,&manager).err().unwrap(),SessionError::Denied);
        assert_eq!(capability(label).err().unwrap(),SessionError::Denied);
    }
    let cap=capability("main").unwrap();
    assert!(cap.native_core); assert_eq!(cap.terminal_available,cfg!(unix)); assert!(!cap.dns_available);
    assert_eq!(cap.exact_flush,cfg!(unix)); assert_eq!(cap.runtime_available,cfg!(unix));
    assert_eq!(cap.reason,if cfg!(unix) {None} else {Some("legacy_socket_urgent_boundary_unavailable")});
}
#[test]
fn decimal_counters_are_canonical_and_preserve_more_than_javascript_integer_precision() {
    for value in [0,1,9_007_199_254_740_993,u64::MAX] { assert_eq!(dto::counter(&value.to_string()).unwrap(),value); }
    for value in ["","+1","-1"," 1","1 ","01","00","1e3","1.0","18446744073709551616","000000000000000000000","１"] {
        assert_eq!(dto::counter(value),Err(SessionError::InvalidAck));
    }
    assert_eq!(AckDto {epoch:"0".into(),sequence:"0".into()}.into_core(),Err(SessionError::InvalidAck));
    let ack=AckDto {epoch:u64::MAX.to_string(),sequence:u64::MAX.to_string()}.into_core().unwrap();
    assert_eq!(ack.epoch,u64::MAX); assert_eq!(ack.sequence,u64::MAX);
}
#[test]
fn json_rejects_extra_fields_nested_flags_wrong_types_and_nonbytes() {
    for field in ["owner","password","credential_id","target_override"] {
        let mut value=request(); value[field]=json!("private"); assert!(serde_json::from_value::<ReserveRequest>(value).is_err());
    }
    let mut value=request(); value["window"]["extra"]=json!(true); assert!(serde_json::from_value::<ReserveRequest>(value).is_err());
    for value in [json!({"reservation_id":"x","data":[256]}),json!({"reservation_id":"x","data":[-1]}),
        json!({"reservation_id":"x","data":[1.5]}),json!({"reservation_id":"x","data":"private"})] {
        assert!(serde_json::from_value::<WriteRequest>(value).is_err());
    }
    assert!(serde_json::from_value::<ReadRequest>(json!({"reservation_id":"x","epoch":0})).is_err());
    assert!(serde_json::from_value::<ReadRequest>(json!({"reservation_id":"x","epoch":"0","ack":{"epoch":"0","sequence":1}})).is_err());
    assert!(serde_json::from_value::<ResizeRequest>(json!({"reservation_id":"x","window":{"rows":-1,"columns":80}})).is_err());
}
#[test]
fn reserve_validates_consent_profile_and_numeric_addresses_or_refuses_platform_before_io() {
    let manager=SessionManager::default(); let boundary=Boundary::new("main",&manager).unwrap();
    if cfg!(windows) {
        assert_eq!(boundary.reserve(decode(request())),Err(SocketError::UrgentBoundaryUnavailable.into())); return;
    }
    let mut value=request(); value["allow_plaintext"]=json!(false);
    assert_eq!(boundary.reserve(decode(value)),Err(SessionError::ConsentRequired));
    for address in ["example.invalid","0.0.0.0","224.0.0.1","255.255.255.255","::1","127.0.0.1 "] {
        for field in ["local_address","target_address"] {
            let mut value=request(); value[field]=json!(address);
            assert_eq!(boundary.reserve(decode(value)),Err(SocketError::InvalidAddress.into()));
        }
    }
    let mut value=request(); value["remote_user"]=json!("x".repeat(31));
    assert_eq!(boundary.reserve(decode(value)).err().unwrap().code(),"rlogin_invalid_user");
    let id=boundary.reserve(decode(request())).unwrap();
    assert_eq!(boundary.status(&id).unwrap().phase,"reserved"); boundary.cancel(&id).unwrap();
    assert_eq!(boundary.status(&id).err().unwrap(),SessionError::Expired);
}
#[test]
fn canonical_ids_and_cleanup_are_checked_even_when_platform_io_is_unavailable() {
    let manager=SessionManager::default(); let b=Boundary::new("main",&manager).unwrap();
    for id in ["", "00000000-0000-0000-0000-000000000000", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa"] {
        assert_eq!(b.status(id).err().unwrap(),SessionError::Expired); assert_eq!(b.cancel(id),Err(SessionError::Expired));
    }
    let id=uuid::Uuid::new_v4().to_string(); assert_eq!(b.status(&id).err().unwrap(),SessionError::Expired); b.cancel(&id).unwrap();
    let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    rt.block_on(async {
        b.close(&id).await.unwrap();
        let expected=if cfg!(windows) {SocketError::UrgentBoundaryUnavailable.into()} else {SessionError::Expired};
        assert_eq!(b.start(&id).await,Err(expected));
        assert_eq!(b.write(WriteRequest {reservation_id:id.clone(),data:vec![0,255]}),Err(expected));
    });
}
#[test]
fn serialized_projection_preserves_binary_and_counters_without_config_or_success_inference() {
    let reply=ReadReplyDto::from(ReadReply {epoch:u64::MAX,phase:Phase::Closed,reason:None,requires_reset:false,
        awaiting_ack:true,finished:false,frame:Some(OutputFrame {epoch:u64::MAX,sequence:9_007_199_254_740_993,data:vec![0,128,255]})});
    let value=serde_json::to_value(reply).unwrap();
    assert_eq!(value["epoch"],u64::MAX.to_string()); assert_eq!(value["frame"]["sequence"],"9007199254740993");
    assert_eq!(value["frame"]["data"],json!([0,128,255])); assert_eq!(value["phase"],"closed"); assert!(value["reason"].is_null());
    for forbidden in ["exit_code","authenticated","target_address","local_user","remote_user","password"] { assert!(value.get(forbidden).is_none()); }
    for (phase,name) in [(Phase::Reserved,"reserved"),(Phase::Starting,"starting"),(Phase::InitialExchangeReady,"initial_exchange_ready"),
        (Phase::Closing,"closing"),(Phase::Closed,"closed"),(Phase::Failed,"failed")] {
        let status=StatusDto::from(SessionStatus {epoch:0,phase,reason:Some(SessionError::Connect(ConnectError::Socket(SocketError::Cancelled))),awaiting_ack:false,finished:true});
        let status=serde_json::to_value(status).unwrap(); assert_eq!(status["phase"],name);
        assert_eq!(status["reason"],"legacy_socket_cancelled"); assert!(status.get("frame").is_none());
    }
}
