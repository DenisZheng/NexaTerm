//! Import the exact production modules without compiling the desktop dependency graph.
#[path = "../../../src/rlogin/mod.rs"] pub mod rlogin;
#[path = "../../../src/legacy_socket/mod.rs"] pub mod legacy_socket;
#[path = "../../../src/rlogin_native/mod.rs"] pub mod rlogin_native;
