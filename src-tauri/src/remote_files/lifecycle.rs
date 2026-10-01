use super::RemoteFileManager;

impl RemoteFileManager {
    pub async fn invalidate_connection(&self, connection_id: &str) -> bool {
        let connection_id = connection_id.trim();
        if connection_id.is_empty() {
            return false;
        }
        let removed = self.sessions.lock().await.remove(connection_id);
        if let Some(handle) = removed {
            self.close_handle(handle).await;
            true
        } else {
            false
        }
    }
}
