use super::*;
use serde_json::json;
pub(crate) fn input()->ConnectionProfileInput {
    serde_json::from_value(json!({"protocol":"rlogin","host":"127.0.0.1","port":513,"username":"remote","credential_mode":"prompt",
        "rlogin":{"local_address":"127.0.0.1","local_user":"local"}})).unwrap()
}
#[test]
fn rlogin_defaults_are_independent_of_ssh_and_config_round_trips_without_consent() {
    let mut request=input();request.advanced.terminal_encoding="gbk".into();
    let validated=validate_profile_input(&request).unwrap();
    assert_eq!(validated.protocol,ConnectionProtocol::Rlogin);assert_eq!(validated.username,"remote");
    let config=validated.rlogin.unwrap();assert_eq!(config.terminal,"xterm-256color");assert_eq!(config.speed,38400);
    assert_eq!(validated.advanced.terminal_encoding,"gbk");assert_eq!(validated.credential_mode,ConnectionCredentialMode::Prompt);
    assert!(validated.credential_id.is_none() && validated.inline_auth_kind.is_none() && validated.inline_password.is_none());
    let value=serde_json::to_value(config).unwrap();
    for field in ["allow_plaintext","reservation_id","password","credential_id"] {assert!(value.get(field).is_none());}
}
#[test]
fn rlogin_uses_the_actual_bsd_and_numeric_ipv4_validation_before_persistence() {
    for address in ["bad host","::1","0.0.0.0","224.0.0.1","255.255.255.255"] {
        let mut request=input();request.host=address.into();assert_eq!(validate_profile_input(&request).unwrap_err().code,"legacy_socket_invalid_address");
        let mut request=input();request.rlogin.as_mut().unwrap().local_address=address.into();assert_eq!(validate_profile_input(&request).unwrap_err().code,"legacy_socket_invalid_address");
    }
    let mut hostname=input();hostname.host="Example.invalid.".into();
    assert_eq!(validate_profile_input(&hostname).unwrap().host,"Example.invalid.");
    hostname.rlogin.as_mut().unwrap().local_address="example.invalid".into();
    assert_eq!(validate_profile_input(&hostname).unwrap_err().code,"legacy_socket_invalid_address");
    for user in ["".to_owned(),"x".repeat(31),"中".repeat(11),"nul\0user".into(),"line\nuser".into()] {
        let mut request=input();request.username=user;assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_invalid_user");
    }
    let mut request=input();request.rlogin.as_mut().unwrap().speed=0;assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_invalid_speed");
    let mut request=input();request.rlogin.as_mut().unwrap().terminal="xterm/other".into();assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_invalid_terminal");
    let mut request=input();request.rlogin=None;assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_config_missing");
}
#[test]
fn rlogin_normalizes_metadata_but_never_changes_case_or_selects_a_credential() {
    let mut request=input();request.host=" 127.0.0.1 ".into();request.username=" RemoteCase ".into();
    request.rlogin.as_mut().unwrap().local_user=" LocalCase ".into();request.rlogin.as_mut().unwrap().local_address=" 127.0.0.1 ".into();
    let canonical=validate_profile_input(&request).unwrap();assert_eq!(canonical.host,"127.0.0.1");assert_eq!(canonical.username,"RemoteCase");
    assert_eq!(canonical.rlogin.unwrap().local_user,"LocalCase");assert!(canonical.credential_id.is_none());
}
#[test]
fn rlogin_refuses_saved_inline_legacy_credentials_proxy_jump_x11_and_other_protocol_payloads() {
    for (field,value) in [
        ("credential_mode",json!("saved")),("credential_id",json!("fixture-account")),("inline_auth_kind",json!("password")),
        ("inline_password",json!("fixture password")),("inline_password_touched",json!(true)),("password",json!("fixture password")),
        ("private_key_path",json!("fixture.key")),("inline_private_key_passphrase",json!("fixture passphrase")),
        ("proxy",json!({"kind":"http_connect","host":"127.0.0.1","port":8080})),
        ("jump",json!({"kind":"ssh_jump","jump_connection_id":"fixture-jump"})),
        ("telnet",json!({"enter_mode":"cr_lf","backspace_mode":"del"})),
    ] {
        let mut value_in=serde_json::to_value(input()).unwrap();value_in[field]=value;
        let request:ConnectionProfileInput=serde_json::from_value(value_in).unwrap();
        assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_config_unsupported","{field}");
    }
    let mut request=input();request.advanced.x11_forwarding=true;assert_eq!(validate_profile_input(&request).unwrap_err().code,"rlogin_config_unsupported");
}
#[test]
fn rlogin_config_rejects_credential_consent_and_runtime_fields_instead_of_saving_them() {
    for field in ["password","allow_plaintext","reservation_id","terminal_encoding","port"] {
        let mut value=json!({"local_address":"127.0.0.1","local_user":"local"});value[field]=json!("fixture");
        assert!(serde_json::from_value::<RloginConnectionConfig>(value).is_err(),"{field}");
    }
}
#[test]
fn legacy_json_store_preserves_the_independent_rlogin_configuration() {
    let root=std::env::temp_dir().join(format!("rlogin-json-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&root).unwrap();let path=root.join("connections.json");
    let mut store=ConnectionStore::load(path.clone()).unwrap();let mut request=input();request.advanced.terminal_encoding="big5".into();
    let saved=store.upsert(request,"t").unwrap();drop(store);
    let reopened=ConnectionStore::load(path).unwrap().get(&saved.id).unwrap();assert_eq!(reopened,saved);validate_loaded_rlogin(&reopened).unwrap();
    std::fs::remove_dir_all(root).unwrap();
}
