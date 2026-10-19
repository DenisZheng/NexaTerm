//! Fast native OS feedback using the production module, without the Tauri graph.
#[cfg(test)] use std::time::Duration;
#[cfg(test)] const POLL: Duration = Duration::from_millis(25);
#[cfg(test)] #[path = "../../../src/xdmcp/platform.rs"] mod platform;
#[cfg(all(test, windows))] #[path = "../../../src/xdmcp/windows.rs"] mod windows;
#[cfg(test)] #[path = "../../xdmcp_observed_process.rs"] mod observed_process;
#[cfg(test)] #[path = "../../../src/xdmcp/mod.rs"] mod xdmcp;
// Only the fixed error-code boundary is stubbed; full application CI checks real AppError/Tauri.
#[cfg(test)] mod app_error {
    #[derive(Debug)] pub struct AppError { pub code: String }
    impl AppError {
        pub fn new(code: &str, _: &str, _: &str, _: bool) -> Self { Self { code: code.to_owned() } }
    }
}

#[test]
fn production_platform_stop_and_natural_exit() {
    use std::{fs, net::Ipv4Addr, path::Path, process::Command, time::Instant};
    #[cfg(target_os = "macos")] assert!(!platform::mac_group_has_no_live_members(unsafe { libc::getpgrp() }));
    let fixture_root = std::env::temp_dir().join(format!("nexaterm-platform-fixture-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&fixture_root).unwrap();
    let executable = fixture_root.join(if cfg!(windows) { "fixture.exe" } else { "fixture" });
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("xdmcp_process.rs");
    let output = Command::new(std::env::var_os("RUSTC").unwrap_or("rustc".into())).arg("--edition=2021")
        .arg(source).arg("-o").arg(&executable).output().unwrap();
    assert!(output.status.success(), "native fixture compile failed");
    platform::validate_executable(&executable).unwrap();
    for target in [Ipv4Addr::LOCALHOST, Ipv4Addr::new(127,0,0,2),Ipv4Addr::new(127,0,0,5)] {
        let directory = platform::RunDirectory::create(123).unwrap();
        let args = platform::arguments(123, target, Ipv4Addr::LOCALHOST, &directory.path);
        let mut process = platform::OwnedProcess::spawn(&executable, &args, &directory.path).unwrap();
        let marker=fixture_root.join("123");
        let child=if target!=Ipv4Addr::new(127,0,0,2) {
            let deadline=Instant::now()+Duration::from_secs(5);
            while !marker.join("heartbeat").exists() {
                assert!(Instant::now()<deadline,"descendant did not publish readiness"); std::thread::sleep(POLL);
            }
            Some(observed_process::ObservedProcess::capture(fs::read_to_string(marker.join("heartbeat")).unwrap().parse().unwrap()))
        } else { None };
        if target == Ipv4Addr::LOCALHOST {
            process.terminate().expect("production explicit termination failed");
        } else {
            if child.is_some() { fs::write(marker.join("allow-exit"),b"exit").unwrap(); }
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                if process.exited().expect("production exit observation failed").is_some() { break; }
                assert!(Instant::now() < deadline, "natural exit did not finish");
                std::thread::sleep(POLL);
            }
        }
        drop(process);
        if let Some(child)=child { child.assert_stopped(); }
        // Match the worker: Windows can briefly retain directory handles after
        // job accounting reaches zero. Completion still requires real removal.
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match directory.cleanup() {
                Ok(()) => break,
                Err(error) => {
                    assert!(Instant::now() < deadline, "production directory cleanup failed: {error}");
                    std::thread::sleep(POLL);
                }
            }
        }
        assert!(!directory.path.exists());
        let _=fs::remove_dir_all(marker);
    }
    let _ = fs::remove_dir_all(fixture_root);
}
