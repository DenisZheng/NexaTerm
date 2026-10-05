use std::fs::{self, OpenOptions};
use std::path::PathBuf;

fn ensure_external_bin_placeholder() {
    let target = std::env::var("TARGET").expect("Cargo TARGET must be set");
    let extension = if target.contains("windows") { ".exe" } else { "" };
    let binaries = PathBuf::from("binaries");
    let path = binaries.join(format!("nexaterm-mcp-{target}{extension}"));

    if path.exists() {
        return;
    }

    fs::create_dir_all(&binaries).expect("create Tauri sidecar binaries directory");
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .unwrap_or_else(|error| panic!("create sidecar placeholder {}: {error}", path.display()));

    println!(
        "cargo:warning=created temporary NexaTerm MCP sidecar placeholder for {target}"
    );
}

fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    // Tauri validates bundle.externalBin during every Cargo build-script run,
    // including plain cargo check/test. The real sidecar is compiled and
    // replaces this placeholder in beforeDevCommand/beforeBuildCommand.
    ensure_external_bin_placeholder();
    tauri_build::build()
}
