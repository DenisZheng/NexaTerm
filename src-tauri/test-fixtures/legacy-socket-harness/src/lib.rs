//! Import the exact production modules without compiling the desktop dependency graph.
#[path = "../../../src/rlogin/mod.rs"] pub mod rlogin;
#[path = "../../../src/legacy_socket/mod.rs"] pub mod legacy_socket;
#[path = "../../../src/rlogin_native/mod.rs"] pub mod rlogin_native;
#[path = "../../../src/rlogin_connect/mod.rs"] pub mod rlogin_connect;
#[path = "../../../src/rlogin_session/mod.rs"] pub mod rlogin_session;
#[path = "../../../src/rlogin_ipc/mod.rs"] mod rlogin_ipc;

#[path = "../../../src/rsh/mod.rs"] pub mod rsh;

#[path = "../../../src/legacy_dns/mod.rs"] pub mod legacy_dns;
#[path = "../../../src/legacy_session.rs"] mod legacy_session;

#[path = "../../../src/legacy_text.rs"] mod legacy_text;
#[path = "../../../src/rsh_session/mod.rs"] pub mod rsh_session;
