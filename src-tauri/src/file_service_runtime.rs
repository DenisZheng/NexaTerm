use tauri::{State, WebviewWindow};
use crate::app_error::AppError;
use crate::file_service::{error, AuditRecord, FileServiceManager, ServiceStatus, StartedService};
fn require_main(window: &WebviewWindow) -> Result<(), AppError> {
    if window.label() == "main" { Ok(()) } else { Err(error("file_service_unavailable")) }
}
#[tauri::command]
pub(crate) fn file_service_reserve(window: WebviewWindow, manager: State<'_, FileServiceManager>) -> Result<String, AppError> {
    require_main(&window)?; manager.reserve(window.label())
}
#[tauri::command]
pub(crate) async fn file_service_start(window: WebviewWindow, manager: State<'_, FileServiceManager>, reservation_id: String, path: String, port: u16) -> Result<StartedService, AppError> {
    require_main(&window)?; manager.start(window.label(), &reservation_id, path, port).await
}
#[tauri::command]
pub(crate) async fn file_service_stop(window: WebviewWindow, manager: State<'_, FileServiceManager>, reservation_id: String) -> Result<(), AppError> {
    require_main(&window)?; manager.stop(window.label(), &reservation_id).await
}
#[tauri::command]
pub(crate) fn file_service_status(window: WebviewWindow, manager: State<'_, FileServiceManager>) -> Result<Option<ServiceStatus>, AppError> {
    require_main(&window)?; manager.status(window.label())
}
#[tauri::command]
pub(crate) fn file_service_audit(window: WebviewWindow, manager: State<'_, FileServiceManager>) -> Result<Vec<AuditRecord>, AppError> {
    require_main(&window)?; manager.audit()
}
