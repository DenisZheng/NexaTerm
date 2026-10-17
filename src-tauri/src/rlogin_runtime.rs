//! Tauri实际窗口边界；协议状态/DTO和资源所有权分别由ipc/core模块承担。
use tauri::{State, WebviewWindow};
use crate::{app_error::AppError, rlogin_ipc::{self, Boundary, Capability, ReadReplyDto, ReadRequest, ReserveRequest, ResizeRequest, StatusDto, WriteRequest},
    rlogin_session::{SessionError, SessionManager}};
use crate::rlogin_ipc::WriteTextRequest;
fn checked<'a>(window: &WebviewWindow, manager: &'a SessionManager) -> Result<Boundary<'a>, AppError> {
    Boundary::new(window.label(),manager).map_err(error)
}
fn error(value: SessionError) -> AppError {
    let message = match value {
        SessionError::Denied => "仅主窗口可使用此操作。",
        SessionError::ConsentRequired => "需要本次明文连接许可。",
        SessionError::Busy => "会话或队列额度已满，请稍后重试。",
        SessionError::InvalidEncoding => "Rlogin 终端编码无效，请检查连接配置。",
        SessionError::EncodingFailed => "输入包含当前终端编码无法表示的字符，请检查编码后重新连接。",
        SessionError::Connect(crate::rlogin_connect::ConnectError::Socket(crate::legacy_socket::SocketError::UrgentBoundaryUnavailable)) => "当前平台尚缺少 Rlogin 精确输出控制能力。",
        _ => "Rlogin 操作未完成。",
    };
    AppError::new(value.code(),message,value.code(),true)
}
#[tauri::command]
pub(crate) fn rlogin_capabilities(window: WebviewWindow) -> Result<Capability, AppError> {
    rlogin_ipc::capability(window.label()).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_reserve(window: WebviewWindow, manager: State<'_, SessionManager>, request: ReserveRequest) -> Result<String, AppError> {
    checked(&window,&manager)?.reserve(request).map_err(error)
}
#[tauri::command]
pub(crate) async fn rlogin_start(window: WebviewWindow, manager: State<'_, SessionManager>, reservation_id: String) -> Result<(), AppError> {
    checked(&window,&manager)?.start(&reservation_id).await.map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_write(window: WebviewWindow, manager: State<'_, SessionManager>, request: WriteRequest) -> Result<(), AppError> {
    checked(&window,&manager)?.write(request).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_write_text(window: WebviewWindow, manager: State<'_, SessionManager>, request: WriteTextRequest) -> Result<(), AppError> {
    checked(&window,&manager)?.write_text(request).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_resize(window: WebviewWindow, manager: State<'_, SessionManager>, request: ResizeRequest) -> Result<(), AppError> {
    checked(&window,&manager)?.resize(request).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_read(window: WebviewWindow, manager: State<'_, SessionManager>, request: ReadRequest) -> Result<ReadReplyDto, AppError> {
    checked(&window,&manager)?.read(request).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_status(window: WebviewWindow, manager: State<'_, SessionManager>, reservation_id: String) -> Result<StatusDto, AppError> {
    checked(&window,&manager)?.status(&reservation_id).map_err(error)
}
#[tauri::command]
pub(crate) fn rlogin_cancel(window: WebviewWindow, manager: State<'_, SessionManager>, reservation_id: String) -> Result<(), AppError> {
    checked(&window,&manager)?.cancel(&reservation_id).map_err(error)
}
#[tauri::command]
pub(crate) async fn rlogin_close(window: WebviewWindow, manager: State<'_, SessionManager>, reservation_id: String) -> Result<(), AppError> {
    checked(&window,&manager)?.close(&reservation_id).await.map_err(error)
}
