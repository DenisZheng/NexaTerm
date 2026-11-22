use super::*;

#[derive(Debug, Deserialize)]
pub struct RemoteFileSaveAsRequest {
    pub connection_id: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub async fn remote_file_save_as(
    app: AppHandle,
    manager: State<'_, RemoteFileManager>,
    request: RemoteFileSaveAsRequest,
) -> Result<RemoteFileWriteResult, AppError> {
    let profile = resolve_remote_connection_profile(&app, &request.connection_id).await?;
    let path = require_remote_path(&request.path)?;
    manager
        .save_file_as(&app, profile, path, &request.content)
        .await
}
