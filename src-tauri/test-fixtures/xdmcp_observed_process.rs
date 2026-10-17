//! 测试观察的是关闭前的进程身份，不能在关闭后仅凭可能重用的PID重新打开。
#[cfg(windows)]
pub struct ObservedProcess(::windows::Win32::Foundation::HANDLE);
#[cfg(not(windows))]
pub struct ObservedProcess(u32);
impl ObservedProcess {
    pub fn capture(pid:u32)->Self {
        #[cfg(windows)] {
            use ::windows::Win32::System::Threading::*;
            let handle=unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,false,pid) }
                .expect("fixture descendant must be alive before stop");
            Self(handle)
        }
        #[cfg(not(windows))] { Self(pid) }
    }
    pub fn assert_stopped(&self) {
        #[cfg(target_os="linux")] {
            if let Ok(stat)=std::fs::read_to_string(format!("/proc/{}/stat",self.0)) {
                assert!(stat.rsplit_once(')').unwrap().1.trim_start().starts_with('Z'),"owned descendant still running");
            }
        }
        #[cfg(target_os="macos")] {
            let output=std::process::Command::new("ps").args(["-o","stat=","-p",&self.0.to_string()]).output().unwrap();
            let state=String::from_utf8_lossy(&output.stdout); assert!(state.trim().is_empty() || state.trim().starts_with('Z'));
        }
        #[cfg(windows)] {
            use ::windows::Win32::{Foundation::WAIT_OBJECT_0,System::Threading::WaitForSingleObject};
            assert_eq!(unsafe { WaitForSingleObject(self.0,0) },WAIT_OBJECT_0,"owned descendant still running");
        }
    }
}
#[cfg(windows)]
impl Drop for ObservedProcess {
    fn drop(&mut self) { unsafe { let _=::windows::Win32::Foundation::CloseHandle(self.0); } }
}
