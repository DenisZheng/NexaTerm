use std::sync::Arc;
use std::thread;

use nexaterm_lib::storage_repository::StorageRepository;
use nexaterm_lib::storage_vault::{InMemorySecretStore, SecretStore};

#[test]
fn concurrent_open_root_survives_busy_lock() {
    let root = std::env::temp_dir().join(format!(
        "mxterm-concurrent-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&root).unwrap();
    let secrets: Arc<dyn SecretStore> = Arc::new(InMemorySecretStore::default());

    // 先建库并标记已迁移，使后续每次 open_root 走 repair 分支（与生产一致）。
    StorageRepository::open_root(&root, Arc::clone(&secrets)).unwrap();

    let mut handles = Vec::new();
    for i in 0..8 {
        let root = root.clone();
        let secrets = Arc::clone(&secrets);
        handles.push(thread::spawn(move || {
            StorageRepository::open_root(&root, secrets)
                .and_then(|repo| repo.connection_list().map(|_| repo))
                .map(|repo| (i, repo))
                .map_err(|error| (i, error.raw_message))
        }));
    }

    let mut failures = Vec::new();
    for handle in handles {
        match handle.join().unwrap() {
            Ok(_) => {}
            Err((i, raw)) => failures.push(format!("thread {i}: {raw}")),
        }
    }

    assert!(
        failures.is_empty(),
        "并发 open_root 失败，busy_timeout 未覆盖真实场景：\n{}",
        failures.join("\n")
    );
}
