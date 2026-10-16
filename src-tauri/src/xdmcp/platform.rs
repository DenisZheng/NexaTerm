use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
#[cfg(unix)] use std::process::{Child, Command, Stdio};

pub(super) fn validate_executable(path: &Path) -> Result<(), &'static str> {
    if !path.is_absolute() || path.as_os_str().len() > 4096 || path.to_string_lossy().contains('\0') { return Err("invalid_request"); }
    let metadata = fs::symlink_metadata(path).map_err(|_| "engine_unavailable")?;
    if !metadata.file_type().is_file() { return Err("engine_unavailable"); }
    let mut magic = [0_u8; 4];
    let mut file = fs::File::open(path).map_err(|_| "engine_unavailable")?;
    if !file.metadata().map_err(|_| "engine_unavailable")?.file_type().is_file() { return Err("engine_unavailable"); }
    file.read_exact(&mut magic).map_err(|_| "engine_unavailable")?;
    let native = if cfg!(windows) { magic.starts_with(b"MZ") }
        else if cfg!(target_os = "macos") { matches!(magic, [0xcf,0xfa,0xed,0xfe] | [0xfe,0xed,0xfa,0xcf] | [0xca,0xfe,0xba,0xbe] | [0xca,0xfe,0xba,0xbf] | [0xbe,0xba,0xfe,0xca] | [0xbf,0xba,0xfe,0xca]) }
        else { magic == *b"\x7fELF" };
    if !native { return Err("engine_unavailable"); }
    Ok(())
}
pub(super) struct RunDirectory { pub path: PathBuf }
impl RunDirectory {
    pub fn cleanup(&self) -> std::io::Result<()> {
        match fs::remove_dir_all(&self.path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }
    pub fn create(display: u16) -> Result<Self, &'static str> {
        let path = std::env::temp_dir().join(format!("nexaterm-xdmcp-{}", uuid::Uuid::new_v4()));
        #[cfg(unix)] {
            use std::os::unix::fs::DirBuilderExt;
            fs::DirBuilder::new().mode(0o700).create(&path).map_err(|_| "start_failed")?;
        }
        #[cfg(windows)] super::windows::private_directory(&path).map_err(|_| "start_failed")?;
        let owned = Self { path };
        let mut cookie = [0_u8; 16];
        getrandom::fill(&mut cookie).map_err(|_| "start_failed")?;
        let mut options = OpenOptions::new(); options.write(true).create_new(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let mut auth = options.open(owned.path.join("authority")).map_err(|_| "start_failed")?;
        // Xauthority binary record. Cookie is never a command-line argument.
        auth.write_all(&65535_u16.to_be_bytes()).map_err(|_| "start_failed")?;
        let number = display.to_string();
        for field in [&[][..], number.as_bytes(), b"MIT-MAGIC-COOKIE-1", &cookie] {
            auth.write_all(&(field.len() as u16).to_be_bytes()).and_then(|_| auth.write_all(field)).map_err(|_| "start_failed")?;
        }
        auth.flush().map_err(|_| "start_failed")?;
        Ok(owned)
    }
}
impl Drop for RunDirectory { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.path); } }
pub(super) fn arguments(display: u16, target: Ipv4Addr, local: Ipv4Addr, directory: &Path) -> Vec<OsString> {
    let mut args: Vec<OsString> = [format!(":{display}"), "-query".into(), target.to_string(), "-from".into(),
        local.to_string(), "-auth".into()].into_iter().map(Into::into).collect();
    args.push(directory.join("authority").into_os_string());
    args.extend(["-terminate", "-listen", "tcp", "-nolisten", "local"].map(Into::into));
    #[cfg(windows)] args.extend(["-logfile", "NUL"].map(Into::into));
    args
}

#[cfg(windows)] pub(super) use super::windows::OwnedProcess;
#[cfg(unix)]
pub(super) struct OwnedProcess { child: Child, group: i32, terminated: bool }
#[cfg(unix)]
impl OwnedProcess {
    pub fn spawn(path: &Path, args: &[OsString], directory: &Path) -> std::io::Result<Self> {
        use std::os::unix::process::CommandExt;
        let child = Command::new(path).args(args).current_dir(directory).stdin(Stdio::null())
            .stdout(Stdio::null()).stderr(Stdio::null()).process_group(0).spawn()?;
        Ok(Self { group: child.id() as i32, child, terminated: false })
    }
    pub fn exited(&mut self) -> std::io::Result<Option<bool>> {
        // Observe without reaping: the group leader PID cannot be recycled before killpg.
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        let result = unsafe { libc::waitid(libc::P_PID, self.child.id() as libc::id_t, &mut info,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT) };
        if result != 0 { return Err(std::io::Error::last_os_error()); }
        if info.si_signo == 0 { return Ok(None); }
        self.stop_group()?;
        let status = self.child.wait()?; self.terminated = true;
        Ok(Some(status.success()))
    }
    fn stop_group(&self) -> std::io::Result<()> {
        // Keep the unreaped direct child until all group signals have been sent.
        let _ = unsafe { libc::kill(-self.group, libc::SIGTERM) };
        std::thread::sleep(std::time::Duration::from_millis(100));
        let result = unsafe { libc::kill(-self.group, libc::SIGKILL) };
        if result != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) { return Err(error); }
        }
        Ok(())
    }
    pub fn terminate(&mut self) -> std::io::Result<()> {
        if self.terminated { return Ok(()); }
        self.stop_group()?;
        self.child.wait()?; self.terminated = true; Ok(())
    }
}
#[cfg(unix)] impl Drop for OwnedProcess { fn drop(&mut self) { let _ = self.terminate(); } }

#[cfg(windows)]
pub(super) fn windows_command_line(path: &Path, args: &[OsString]) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut result = Vec::new();
    for argument in std::iter::once(path.as_os_str()).chain(args.iter().map(|a| a.as_os_str())) {
        if !result.is_empty() { result.push(32); }
        result.push(34); let mut slashes = 0;
        for unit in argument.encode_wide() {
            if unit == 92 { slashes += 1; continue; }
            if unit == 34 { result.extend(std::iter::repeat_n(92, slashes * 2 + 1)); }
            else { result.extend(std::iter::repeat_n(92, slashes)); }
            slashes = 0; result.push(unit);
        }
        result.extend(std::iter::repeat_n(92, slashes * 2)); result.push(34);
    }
    result.push(0); result
}
