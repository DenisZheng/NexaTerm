//! Canonical IDs/counters shared by native legacy IPC; protocol errors stay local.
pub(crate) fn id(value:&str)->bool {
    value.len()==36 && uuid::Uuid::try_parse(value).is_ok_and(|id|id.get_version_num()==4 && id.to_string()==value)
}
pub(crate) fn counter(value:&str)->Option<u64>{
    if value.is_empty()||value.len()>20||!value.bytes().all(|b|b.is_ascii_digit())||value.len()>1&&value.starts_with('0'){return None;}
    value.parse().ok()
}
