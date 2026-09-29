use std::sync::Arc;

use russh::{client, Channel};
use tokio::io::{AsyncWriteExt, copy_bidirectional};
use tokio::net::TcpStream;
use tokio::sync::RwLock;

use crate::app_error::AppError;

#[derive(Clone, Debug)]
struct RemoteForwardTarget {
    host: String,
    port: u16,
}

#[derive(Clone)]
pub enum RemoteForwardEvent {
    Started,
    Finished { error: Option<AppError> },
}

pub type RemoteForwardEventHandler = Arc<dyn Fn(RemoteForwardEvent) + Send + Sync + 'static>;

#[derive(Clone, Default)]
pub(super) struct RemoteForwardState {
    target: Arc<RwLock<Option<RemoteForwardTarget>>>,
    event_handler: Arc<RwLock<Option<RemoteForwardEventHandler>>>,
}

impl RemoteForwardState {
    pub(super) async fn set_target(
        &self,
        host: String,
        port: u16,
        event_handler: Option<RemoteForwardEventHandler>,
    ) {
        *self.target.write().await = Some(RemoteForwardTarget { host, port });
        *self.event_handler.write().await = event_handler;
    }

    pub(super) async fn clear_target(&self) {
        *self.target.write().await = None;
        *self.event_handler.write().await = None;
    }

    async fn emit(&self, event: RemoteForwardEvent) {
        if let Some(handler) = self.event_handler.read().await.as_ref().cloned() {
            handler(event);
        }
    }

    pub(super) async fn handle_forwarded_tcpip(&self, channel: Channel<client::Msg>) {
        let target = self.target.read().await.clone();
        let Some(target) = target else {
            let mut remote_stream = channel.into_stream();
            let _ = remote_stream.shutdown().await;
            return;
        };

        self.emit(RemoteForwardEvent::Started).await;
        let result = forward_channel_to_local_target(channel, &target).await;
        self.emit(RemoteForwardEvent::Finished {
            error: result.err(),
        })
        .await;
    }
}

async fn forward_channel_to_local_target(
    channel: Channel<client::Msg>,
    target: &RemoteForwardTarget,
) -> Result<(), AppError> {
    let mut remote_stream = channel.into_stream();
    let mut local_stream = TcpStream::connect((target.host.as_str(), target.port))
        .await
        .map_err(|error| {
            AppError::new(
                "tunnel_remote_target_connect_failed",
                "远程转发回连本机目标失败。",
                format!("{}:{}: {error}", target.host, target.port),
                true,
            )
        })?;
    copy_bidirectional(&mut local_stream, &mut remote_stream)
        .await
        .map_err(|error| {
            AppError::new(
                "tunnel_stream_copy_failed",
                "SSH 隧道数据转发失败。",
                error,
                true,
            )
        })?;
    let _ = remote_stream.shutdown().await;
    let _ = local_stream.shutdown().await;
    Ok(())
}
