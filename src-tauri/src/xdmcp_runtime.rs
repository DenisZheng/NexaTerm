use tauri::{State, WebviewWindow};
use crate::app_error::AppError;
use crate::xdmcp::{self, Capability, LaunchRequest, Status, XdmcpManager};
fn require_main(window: &WebviewWindow) -> Result<(), AppError> {
    if window.label() == "main" { Ok(()) } else { Err(xdmcp::error("unavailable")) }
}
#[tauri::command]
pub(crate) fn xdmcp_capabilities(window: WebviewWindow) -> Result<Capability, AppError> {
    require_main(&window)?; Ok(xdmcp::capability())
}
#[tauri::command]
pub(crate) fn xdmcp_reserve(window: WebviewWindow, manager: State<'_, XdmcpManager>) -> Result<String, AppError> {
    require_main(&window)?; manager.reserve(window.label())
}
#[tauri::command]
pub(crate) async fn xdmcp_start(window: WebviewWindow, manager: State<'_, XdmcpManager>, reservation_id: String, request: LaunchRequest) -> Result<Status, AppError> {
    require_main(&window)?; manager.start(window.label(), &reservation_id, request).await
}
#[tauri::command]
pub(crate) async fn xdmcp_stop(window: WebviewWindow, manager: State<'_, XdmcpManager>, reservation_id: String) -> Result<(), AppError> {
    require_main(&window)?; manager.stop(window.label(), &reservation_id).await
}
#[tauri::command]
pub(crate) fn xdmcp_status(window: WebviewWindow, manager: State<'_, XdmcpManager>) -> Result<Vec<Status>, AppError> {
    require_main(&window)?; manager.status(window.label())
}
