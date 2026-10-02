//! 会话树 IPC；与连接写入共用互斥边界，树规则仍由 repository 校验。
use crate::{
    app_error::AppError,
    commands::{connection_store_lock, now_timestamp},
    connection_groups::{ConnectionGroup, GroupInput},
    storage_repository::StorageRepository,
};
use tauri::AppHandle;

#[tauri::command]
pub async fn connection_group_migrate_legacy(
    app: AppHandle,
    raw: Option<String>,
    resolutions: Option<Vec<crate::connection_group_legacy::LegacyResolution>>,
) -> Result<crate::connection_group_legacy::LegacyReport, AppError> {
    let _guard = connection_store_lock().lock().await;
    StorageRepository::open_app(&app)?.migrate_legacy_groups(
        raw.as_deref(),
        resolutions.as_deref(),
        &now_timestamp()?,
    )
}

#[tauri::command]
pub async fn connection_group_list(app: AppHandle) -> Result<Vec<ConnectionGroup>, AppError> {
    StorageRepository::open_app(&app)?.connection_groups()
}

#[tauri::command]
pub async fn connection_group_save(
    app: AppHandle,
    request: GroupInput,
) -> Result<ConnectionGroup, AppError> {
    let _guard = connection_store_lock().lock().await;
    StorageRepository::open_app(&app)?.save_connection_group(&request, &now_timestamp()?)
}

#[tauri::command]
pub async fn connection_group_delete(app: AppHandle, id: String) -> Result<(), AppError> {
    let _guard = connection_store_lock().lock().await;
    StorageRepository::open_app(&app)?.delete_connection_group(&id)
}

#[tauri::command]
pub async fn connection_group_assign(
    app: AppHandle,
    connection_id: String,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let _guard = connection_store_lock().lock().await;
    StorageRepository::open_app(&app)?.assign_connection_group(
        &connection_id,
        group_id.as_deref(),
        &now_timestamp()?,
    )
}
