use std::ffi::OsString;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use ::windows::core::{w, BOOL, HRESULT, PCWSTR, PWSTR};
use ::windows::Win32::Foundation::{CloseHandle, ERROR_INVALID_PARAMETER, HANDLE, HLOCAL, LocalFree, WAIT_OBJECT_0, WAIT_TIMEOUT};
use ::windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use ::windows::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
use ::windows::Win32::Storage::FileSystem::CreateDirectoryW;
use ::windows::Win32::System::JobObjects::*;
use ::windows::Win32::System::Threading::*;

fn failure() -> std::io::Error { std::io::Error::other("owned process operation failed") }
fn wide(path: &Path) -> Vec<u16> { path.as_os_str().encode_wide().chain(Some(0)).collect() }
struct Handle(HANDLE);
impl Drop for Handle { fn drop(&mut self) { unsafe { let _ = CloseHandle(self.0); } } }
pub(super) fn private_directory(path: &Path) -> std::io::Result<()> {
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(w!("D:P(A;OICI;FA;;;OW)"), 1, &mut descriptor, None).map_err(|_| failure())?; }
    let attributes = SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor.0, bInheritHandle: false.into() };
    let path = wide(path);
    let result = unsafe { CreateDirectoryW(PCWSTR(path.as_ptr()), Some(&attributes)) };
    unsafe { let _ = LocalFree(Some(HLOCAL(descriptor.0))); }
    result.map_err(|_| failure())
}
pub(super) struct OwnedProcess { process: Handle, job: Handle, terminated: bool, stopping_members:Option<Vec<Handle>> }
impl OwnedProcess {
    pub fn spawn(path: &Path, args: &[OsString], directory: &Path) -> std::io::Result<Self> {
        let job = Handle(unsafe { CreateJobObjectW(None, PCWSTR::null()).map_err(|_| failure())? });
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        unsafe { SetInformationJobObject(job.0, JobObjectExtendedLimitInformation,
            &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32).map_err(|_| failure())?; }
        let executable = wide(path); let directory = wide(directory);
        let mut command = super::platform::windows_command_line(path, args);
        let startup = STARTUPINFOW { cb: std::mem::size_of::<STARTUPINFOW>() as u32, ..Default::default() };
        let mut info = PROCESS_INFORMATION::default();
        unsafe { CreateProcessW(PCWSTR(executable.as_ptr()), Some(PWSTR(command.as_mut_ptr())), None, None, false,
            CREATE_SUSPENDED | CREATE_NO_WINDOW, None, PCWSTR(directory.as_ptr()), &startup, &mut info).map_err(|_| failure())?; }
        let process = Handle(info.hProcess); let thread = Handle(info.hThread);
        // Assign before resume: the engine cannot spawn an unowned descendant in the gap.
        if unsafe { AssignProcessToJobObject(job.0, process.0) }.is_err() {
            unsafe { let _ = TerminateProcess(process.0, 1); WaitForSingleObject(process.0, INFINITE); }
            return Err(failure());
        }
        let mut owned = Self { process, job, terminated: false, stopping_members:None };
        if unsafe { ResumeThread(thread.0) } == u32::MAX { let _ = owned.terminate(); return Err(failure()); }
        Ok(owned)
    }
    pub fn exited(&mut self) -> std::io::Result<Option<bool>> {
        match unsafe { WaitForSingleObject(self.process.0, 0) } {
            WAIT_TIMEOUT => return Ok(None),
            WAIT_OBJECT_0 => {},
            _ => return Err(failure()),
        }
        let mut code = 0;
        unsafe { GetExitCodeProcess(self.process.0, &mut code).map_err(|_| failure())?; }
        Ok(Some(code == 0))
    }
    pub fn terminate(&mut self) -> std::io::Result<()> {
        if self.terminated { return Ok(()); }
        if self.stopping_members.is_none() { self.stopping_members=Some(self.capture_stopping_members()?); }
        unsafe { TerminateJobObject(self.job.0, 1).map_err(|_| failure())?; }
        // Job统计归零不是每个process对象已signalled的屏障；保留真实身份直到实际退出。
        for member in self.stopping_members.as_ref().unwrap() {
            if unsafe { WaitForSingleObject(member.0,INFINITE) }!=WAIT_OBJECT_0 { return Err(failure()); }
        }
        if unsafe { WaitForSingleObject(self.process.0,INFINITE) }!=WAIT_OBJECT_0 { return Err(failure()); }
        self.stopping_members=None;
        loop {
            let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            unsafe { QueryInformationJobObject(Some(self.job.0), JobObjectBasicAccountingInformation,
                &mut accounting as *mut _ as *mut _, std::mem::size_of_val(&accounting) as u32, None).map_err(|_| failure())?; }
            if accounting.ActiveProcesses == 0 { break; }
            std::thread::sleep(super::POLL);
        }
        self.terminated = true; Ok(())
    }
    fn capture_stopping_members(&self)->std::io::Result<Vec<Handle>> {
        let mut limits=JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        unsafe {
            QueryInformationJobObject(Some(self.job.0),JobObjectExtendedLimitInformation,
                &mut limits as *mut _ as *mut _,std::mem::size_of_val(&limits) as u32,None).map_err(|_| failure())?;
            // 只在teardown收紧admission；已在运行的成员由下方snapshot接管。
            limits.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
            limits.BasicLimitInformation.ActiveProcessLimit=1;
            SetInformationJobObject(self.job.0,JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,std::mem::size_of_val(&limits) as u32).map_err(|_| failure())?;
        }
        #[repr(C)]
        struct Members { assigned:u32, count:u32, ids:[usize;1024] }
        let mut ids=Members {assigned:0,count:0,ids:[0;1024]};
        unsafe { QueryInformationJobObject(Some(self.job.0),JobObjectBasicProcessIdList,
            &mut ids as *mut _ as *mut _,std::mem::size_of_val(&ids) as u32,None).map_err(|_| failure())?; }
        if ids.count>1024 || ids.assigned>ids.count { return Err(failure()); }
        let mut members=Vec::with_capacity(ids.count as usize);
        for pid in &ids.ids[..ids.count as usize] {
            let pid=u32::try_from(*pid).map_err(|_| failure())?;
            let handle=match unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,false,pid) } {
                Ok(handle)=>Handle(handle),
                Err(error) if error.code()==HRESULT::from_win32(ERROR_INVALID_PARAMETER.0)=>continue,
                Err(_)=>return Err(failure()),
            };
            let mut belongs=BOOL::default();
            unsafe { IsProcessInJob(handle.0,Some(self.job.0),&mut belongs).map_err(|_| failure())?; }
            // PID在snapshot后可能结束并重用；只等待属于本job的真实句柄。
            if belongs.as_bool() { members.push(handle); }
        }
        Ok(members)
    }
}
impl Drop for OwnedProcess { fn drop(&mut self) { let _ = self.terminate(); } }
