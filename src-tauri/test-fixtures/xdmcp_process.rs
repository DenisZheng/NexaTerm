//! Native process fixture, NOT an X server or XDMCP interoperability test.
use std::{env, fs, process::{self, Command, Stdio}, thread, time::Duration};
fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.first().is_some_and(|a| a == "--descendant") {
        loop {
            if fs::write(&args[1], process::id().to_string()).is_err() { break; }
            thread::sleep(Duration::from_millis(10));
        }
        return;
    }
    assert!(!args.iter().any(|a| a == "-ac"));
    let value = |name: &str| args[args.iter().position(|a| a == name).unwrap() + 1].clone();
    let auth = value("-auth"); let directory = env::current_dir().unwrap();
    assert!(fs::read(&auth).unwrap().windows(18).any(|w| w == b"MIT-MAGIC-COOKIE-1"));
    let markers = env::current_exe().unwrap().parent().unwrap().join(args[0].trim_start_matches(':'));
    fs::create_dir_all(&markers).unwrap();
    fs::write(markers.join("directory"), directory.to_str().unwrap()).unwrap();
    fs::write(markers.join("arguments"), args.join("\n")).unwrap();
    let target = value("-query");
    if target == "127.0.0.2" { return; }
    if target == "127.0.0.3" { process::exit(1); }
    let _child = Command::new(env::current_exe().unwrap()).arg("--descendant").arg(markers.join("heartbeat"))
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
    if target == "127.0.0.5" {
        for _ in 0..200 {
            if markers.join("heartbeat").exists() { return; }
            thread::sleep(Duration::from_millis(5));
        }
        process::exit(2);
    }
    loop { thread::sleep(Duration::from_millis(25)); }
}
