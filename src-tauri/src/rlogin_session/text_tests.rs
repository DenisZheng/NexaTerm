use super::{text::{SessionEncoding, MAX_TEXT_BYTES}, tests::*, *};

#[test]
fn strict_eight_encodings_preserve_expected_wire_bytes_and_controls() {
    for (label,text,expected) in [
        ("utf-8","中",vec![0xe4,0xb8,0xad]),
        ("gbk","中",vec![0xd6,0xd0]), ("gb18030","中",vec![0xd6,0xd0]),
        ("big5","中",vec![0xa4,0xa4]), ("euc-jp","あ",vec![0xa4,0xa2]),
        ("iso-2022-jp","あ",vec![0x1b,0x24,0x42,0x24,0x22,0x1b,0x28,0x42]),
        ("shift-jis","あ",vec![0x82,0xa0]), ("euc-kr","가",vec![0xb0,0xa1]),
    ] {
        let encoding=SessionEncoding::new(label).unwrap();
        assert_eq!(encoding.encode(text).unwrap(),expected,"{label}");
        assert_eq!(encoding.encode("\0\r\n\u{7f}\u{3}\u{1b}[A\u{e}\u{f}").unwrap(),[0,13,10,127,3,27,91,65,14,15],"{label}");
        assert!(encoding.encode("").unwrap().is_empty());
    }
}
#[test]
fn labels_are_closed_and_encoding_errors_never_return_replacement_or_input_text() {
    for label in ["", "UTF-8", "gb2312", " gbk", "utf-16", "windows-1252", "replacement"] {
        assert!(matches!(SessionEncoding::new(label),Err(SessionError::InvalidEncoding)));
    }
    let error=SessionEncoding::new("gbk").unwrap().encode("private fixture 😀").unwrap_err();
    assert_eq!(error,SessionError::EncodingFailed);
    assert_eq!(error.to_string(),"rlogin_encoding_failed");
    assert_eq!(SessionEncoding::new("utf-8").unwrap().encode("\u{feff}x").unwrap(),[0xef,0xbb,0xbf,b'x']);
}
#[test]
fn text_byte_budget_is_checked_before_encoding_and_does_not_split_characters() {
    let encoding=SessionEncoding::new("utf-8").unwrap();
    assert_eq!(encoding.encode(&"a".repeat(MAX_TEXT_BYTES)).unwrap().len(),MAX_TEXT_BYTES);
    assert_eq!(encoding.encode(&"a".repeat(MAX_TEXT_BYTES+1)),Err(SessionError::InvalidChunk));
    assert_eq!(encoding.encode(&"中".repeat(MAX_TEXT_BYTES/3+1)),Err(SessionError::InvalidChunk));
    assert_eq!(SessionEncoding::new("gb18030").unwrap().encode("😀").unwrap(),[0x94,0x39,0xfc,0x36]);
}
#[test]
fn reserve_rejects_invalid_encoding_before_admission_and_retains_frozen_encoding_after_start() {
    let manager=SessionManager::default(); let mut invalid=request(); invalid.terminal_encoding="UTF-8".into();
    assert_eq!(manager.reserve("main",invalid,true),Err(SessionError::InvalidEncoding));
    assert_eq!(manager.handle_count(),0);
    let mut config=request(); config.terminal_encoding="gbk".into();
    let id=manager.reserve("main",config,true).unwrap();
    assert_eq!(manager.write_text("foreign",&id,"中"),Err(SessionError::Denied));
    assert_eq!(manager.write_text("main",&id,"中"),Err(SessionError::NotReady));
    let (lease,consumed)=manager.begin("main",&id).unwrap(); drop(consumed);
    lease.state.lock().unwrap().phase=Phase::InitialExchangeReady;
    manager.write_text("main",&id,"中\r").unwrap();
    assert_eq!(lease.state.lock().unwrap().take_input(),Some(vec![0xd6,0xd0,13]));
    drop(lease);
}
#[test]
fn raw_and_text_writes_share_one_queue_and_rejected_text_never_enqueues_a_prefix() {
    let manager=SessionManager::default(); let mut config=request(); config.terminal_encoding="gbk".into();
    let id=manager.reserve("main",config,true).unwrap(); let (lease,_)=manager.begin("main",&id).unwrap();
    lease.state.lock().unwrap().phase=Phase::InitialExchangeReady;
    manager.write("main",&id,b"before").unwrap();
    assert_eq!(manager.write_text("main",&id,"hidden😀"),Err(SessionError::EncodingFailed));
    assert_eq!(manager.write_text("main",&id,&"x".repeat(4097)),Err(SessionError::InvalidChunk));
    manager.write_text("main",&id,"中").unwrap();
    let mut q=lease.state.lock().unwrap();
    assert_eq!(q.take_input(),Some(b"before".to_vec())); q.input_complete(6).unwrap();
    assert_eq!(q.take_input(),Some(vec![0xd6,0xd0])); q.input_complete(2).unwrap(); assert!(q.take_input().is_none());
    drop(q);
    for _ in 0..buffers::ITEM_LIMIT { manager.write("main",&id,b"x").unwrap(); }
    assert_eq!(manager.write_text("main",&id,"中"),Err(SessionError::Busy)); drop(lease);
}
#[test]
fn frozen_text_encoding_delivers_exact_bytes_over_the_actual_owned_socket_in_order() {
    runtime().block_on(async {
        let manager=SessionManager::default(); let mut config=request(); config.terminal_encoding="big5".into();
        let mut f=fixture_with_request(&manager,config).await;
        manager.write_text("main",&f.id,"中\r").unwrap(); manager.write("main",&f.id,&[0xff,0]).unwrap();
        manager.write_text("main",&f.id,"文").unwrap();
        assert_eq!(receive(&mut f.peer,7).await,[0xa4,0xa4,13,0xff,0,0xa4,0xe5]);
        manager.close("main",&f.id).await.unwrap(); eof(&mut f.peer).await; f.task.await.unwrap();
        assert_eq!(manager.write_text("main",&f.id,"later"),Err(SessionError::Expired));
        assert_eq!(manager.available_workers(),4);
    });
}
