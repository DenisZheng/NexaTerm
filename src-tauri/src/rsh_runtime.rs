//! Actual main-window wrappers; no request-supplied ownership or raw diagnostics.
use tauri::{State,WebviewWindow};
use crate::{app_error::AppError,rsh_session::{TaskError,TaskManager},rsh_ipc::{self,Boundary,Capability,ReserveRequest,WriteRequest,WriteTextRequest,ReadRequest,ReadReplyDto,StatusDto,SignalRequest}};
fn checked<'a>(window:&WebviewWindow,manager:&'a TaskManager)->Result<Boundary<'a>,AppError>{Boundary::new(window.label(),manager).map_err(error)}
fn error(value:TaskError)->AppError{AppError::new(value.code(),"Rsh 操作未完成。",value.code(),true)}
#[tauri::command]
pub(crate) fn rsh_capabilities(window:WebviewWindow)->Result<Capability,AppError>{rsh_ipc::capability(window.label()).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_reserve(window:WebviewWindow,manager:State<'_,TaskManager>,request:ReserveRequest)->Result<String,AppError>{checked(&window,&manager)?.reserve(request).map_err(error)}
#[tauri::command]
pub(crate) async fn rsh_start(window:WebviewWindow,manager:State<'_,TaskManager>,reservation_id:String)->Result<(),AppError>{checked(&window,&manager)?.start(&reservation_id).await.map_err(error)}
#[tauri::command]
pub(crate) fn rsh_write(window:WebviewWindow,manager:State<'_,TaskManager>,request:WriteRequest)->Result<(),AppError>{checked(&window,&manager)?.write(request).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_write_text(window:WebviewWindow,manager:State<'_,TaskManager>,request:WriteTextRequest)->Result<(),AppError>{checked(&window,&manager)?.write_text(request).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_stdin_eof(window:WebviewWindow,manager:State<'_,TaskManager>,reservation_id:String)->Result<(),AppError>{checked(&window,&manager)?.close_stdin(&reservation_id).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_signal(window:WebviewWindow,manager:State<'_,TaskManager>,request:SignalRequest)->Result<(),AppError>{checked(&window,&manager)?.signal(request).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_read(window:WebviewWindow,manager:State<'_,TaskManager>,request:ReadRequest)->Result<ReadReplyDto,AppError>{checked(&window,&manager)?.read(request).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_status(window:WebviewWindow,manager:State<'_,TaskManager>,reservation_id:String)->Result<StatusDto,AppError>{checked(&window,&manager)?.status(&reservation_id).map_err(error)}
#[tauri::command]
pub(crate) fn rsh_cancel(window:WebviewWindow,manager:State<'_,TaskManager>,reservation_id:String)->Result<(),AppError>{checked(&window,&manager)?.cancel(&reservation_id).map_err(error)}
#[tauri::command]
pub(crate) async fn rsh_close(window:WebviewWindow,manager:State<'_,TaskManager>,reservation_id:String)->Result<(),AppError>{checked(&window,&manager)?.close(&reservation_id).await.map_err(error)}
