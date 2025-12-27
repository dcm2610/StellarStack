//! Server extraction middleware

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::server::Server;
use super::super::AppState;

/// Extract server from path parameter and add to request extensions
pub async fn extract_server(
    State(state): State<AppState>,
    Path(server_id): Path<String>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    // Look up the server
    let server = match state.manager.get(&server_id) {
        Some(server) => server,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "Not Found",
                    "message": format!("Server '{}' not found", server_id)
                })),
            )
                .into_response();
        }
    };

    // Add server to request extensions
    request.extensions_mut().insert(server);

    // Continue to the handler
    next.run(request).await
}

/// Extension extractor for getting the server from a request
#[derive(Clone)]
pub struct ServerExt(pub Arc<Server>);

impl std::ops::Deref for ServerExt {
    type Target = Arc<Server>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
