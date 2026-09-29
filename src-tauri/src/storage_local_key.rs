use std::fmt;

const KEYCHAIN_SERVICE: &str = "com.nexaterm.app.vault";
const KEYCHAIN_ACCOUNT: &str = "local-master-key-v1";

#[derive(Debug)]
pub enum NativeKeychainError {
    Unavailable(String),
    Failure(String),
    Invalid(String),
}

impl fmt::Display for NativeKeychainError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unavailable(message) => write!(formatter, "native keychain unavailable: {message}"),
            Self::Failure(message) => write!(formatter, "native keychain failure: {message}"),
            Self::Invalid(message) => write!(formatter, "native keychain data invalid: {message}"),
        }
    }
}

#[cfg(test)]
pub fn native_keychain_expected() -> bool {
    false
}

#[cfg(all(not(test), any(target_os = "macos", windows)))]
pub fn native_keychain_expected() -> bool {
    true
}

#[cfg(all(not(test), not(any(target_os = "macos", windows))))]
pub fn native_keychain_expected() -> bool {
    false
}

#[cfg(test)]
pub fn read_local_master_key() -> Result<Option<String>, NativeKeychainError> {
    Err(NativeKeychainError::Unavailable(
        "disabled for unit tests".to_string(),
    ))
}

#[cfg(test)]
pub fn write_local_master_key(_value: &str) -> Result<(), NativeKeychainError> {
    Err(NativeKeychainError::Unavailable(
        "disabled for unit tests".to_string(),
    ))
}

#[cfg(test)]
pub fn delete_local_master_key() -> Result<(), NativeKeychainError> {
    Ok(())
}

#[cfg(all(not(test), target_os = "macos"))]
pub fn read_local_master_key() -> Result<Option<String>, NativeKeychainError> {
    use security_framework::passwords::get_generic_password;
    use security_framework_sys::base::errSecItemNotFound;

    match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            .map_err(|error| NativeKeychainError::Invalid(error.to_string())),
        Err(error) if error.code() == errSecItemNotFound => Ok(None),
        Err(error) => Err(NativeKeychainError::Unavailable(error.to_string())),
    }
}

#[cfg(all(not(test), target_os = "macos"))]
pub fn write_local_master_key(value: &str) -> Result<(), NativeKeychainError> {
    security_framework::passwords::set_generic_password(
        KEYCHAIN_SERVICE,
        KEYCHAIN_ACCOUNT,
        value.as_bytes(),
    )
    .map_err(|error| NativeKeychainError::Failure(error.to_string()))
}

#[cfg(all(not(test), target_os = "macos"))]
pub fn delete_local_master_key() -> Result<(), NativeKeychainError> {
    use security_framework::passwords::delete_generic_password;
    use security_framework_sys::base::errSecItemNotFound;

    match delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == errSecItemNotFound => Ok(()),
        Err(error) => Err(NativeKeychainError::Failure(error.to_string())),
    }
}

#[cfg(all(not(test), windows))]
pub fn read_local_master_key() -> Result<Option<String>, NativeKeychainError> {
    use std::ptr;
    use std::slice;

    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target = wide(KEYCHAIN_ACCOUNT);
    let mut credential: *mut CREDENTIALW = ptr::null_mut();
    let ok = unsafe {
        CredReadW(
            target.as_ptr(),
            CRED_TYPE_GENERIC,
            0,
            &mut credential,
        )
    };
    if ok == 0 {
        let code = unsafe { GetLastError() };
        if code == ERROR_NOT_FOUND {
            return Ok(None);
        }
        return Err(NativeKeychainError::Unavailable(format!(
            "CredReadW failed with Win32 error {code}"
        )));
    }
    if credential.is_null() {
        return Err(NativeKeychainError::Invalid(
            "CredReadW returned a null credential".to_string(),
        ));
    }

    let result = unsafe {
        let credential_ref = &*credential;
        let bytes = slice::from_raw_parts(
            credential_ref.CredentialBlob,
            credential_ref.CredentialBlobSize as usize,
        );
        String::from_utf8(bytes.to_vec())
            .map(Some)
            .map_err(|error| NativeKeychainError::Invalid(error.to_string()))
    };
    unsafe { CredFree(credential.cast()) };
    result
}

#[cfg(all(not(test), windows))]
pub fn write_local_master_key(value: &str) -> Result<(), NativeKeychainError> {
    use std::ptr;

    use windows_sys::Win32::Foundation::{GetLastError, FILETIME};
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target = wide(KEYCHAIN_ACCOUNT);
    let mut blob = value.as_bytes().to_vec();
    let credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        Comment: ptr::null_mut(),
        LastWritten: FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: ptr::null_mut(),
        TargetAlias: ptr::null_mut(),
        UserName: ptr::null_mut(),
    };

    let ok = unsafe { CredWriteW(&credential, 0) };
    blob.fill(0);
    if ok == 0 {
        let code = unsafe { GetLastError() };
        return Err(NativeKeychainError::Failure(format!(
            "CredWriteW failed with Win32 error {code}"
        )));
    }
    Ok(())
}

#[cfg(all(not(test), windows))]
pub fn delete_local_master_key() -> Result<(), NativeKeychainError> {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

    let target = wide(KEYCHAIN_ACCOUNT);
    let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok != 0 {
        return Ok(());
    }
    let code = unsafe { GetLastError() };
    if code == ERROR_NOT_FOUND {
        Ok(())
    } else {
        Err(NativeKeychainError::Failure(format!(
            "CredDeleteW failed with Win32 error {code}"
        )))
    }
}

#[cfg(all(not(test), windows))]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(all(not(test), not(any(target_os = "macos", windows))))]
pub fn read_local_master_key() -> Result<Option<String>, NativeKeychainError> {
    Err(NativeKeychainError::Unavailable(
        "NexaTerm uses the 0600 local-key fallback on this platform".to_string(),
    ))
}

#[cfg(all(not(test), not(any(target_os = "macos", windows))))]
pub fn write_local_master_key(_value: &str) -> Result<(), NativeKeychainError> {
    Err(NativeKeychainError::Unavailable(
        "NexaTerm uses the 0600 local-key fallback on this platform".to_string(),
    ))
}

#[cfg(all(not(test), not(any(target_os = "macos", windows))))]
pub fn delete_local_master_key() -> Result<(), NativeKeychainError> {
    Ok(())
}
