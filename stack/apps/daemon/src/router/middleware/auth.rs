//! Authentication middleware

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use super::super::AppState;

/// Require authentication for API routes
///
/// Validates the Bearer token against the configured node token.
/// For WebSocket routes, authentication is handled by the WebSocket handler itself.
pub async fn require_auth(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    // Skip auth for WebSocket upgrade requests - they handle their own JWT auth
    let is_websocket = request
        .headers()
        .get("Upgrade")
        .and_then(|h| h.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);

    if is_websocket {
        // WebSocket connections authenticate via JWT token in query params
        // This is handled by the WebSocket handler itself
        return next.run(request).await;
    }

    // Get authorization header
    let auth_header = request
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => {
            return unauthorized_response("Missing or invalid authorization header");
        }
    };

    // Expected token format: "token_id.token"
    let expected = format!(
        "{}.{}",
        state.config.remote.token_id,
        state.config.remote.token
    );

    if token != expected {
        return unauthorized_response("Invalid authentication token");
    }

    // Continue to the handler
    next.run(request).await
}

/// Create an unauthorized response
fn unauthorized_response(message: &str) -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "error": "Unauthorized",
            "message": message
        })),
    )
        .into_response()
}

/// Validate a JWT token for WebSocket connections
pub fn validate_websocket_token(token: &str, jwt_secret: &str) -> Result<WebsocketClaims, &'static str> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};

    let validation = Validation::new(Algorithm::HS256);
    let key = DecodingKey::from_secret(jwt_secret.as_bytes());

    let token_data = decode::<WebsocketClaims>(token, &key, &validation)
        .map_err(|_| "Invalid token")?;

    // Check expiration
    let now = chrono::Utc::now().timestamp() as usize;
    if token_data.claims.exp < now {
        return Err("Token expired");
    }

    Ok(token_data.claims)
}

/// JWT claims for WebSocket connections
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct WebsocketClaims {
    /// Server UUID
    pub server_uuid: String,

    /// User ID (optional)
    pub user_id: Option<String>,

    /// Permissions
    #[serde(default)]
    pub permissions: Vec<String>,

    /// Expiration timestamp
    pub exp: usize,

    /// Issued at timestamp
    pub iat: usize,
}

impl WebsocketClaims {
    /// Check if the user has a specific permission
    pub fn has_permission(&self, permission: &str) -> bool {
        // Check for wildcard
        if self.permissions.contains(&"*".to_string()) {
            return true;
        }

        // Check for exact match
        if self.permissions.contains(&permission.to_string()) {
            return true;
        }

        // Check for prefix match (e.g., "control.*" matches "control.start")
        let parts: Vec<&str> = permission.split('.').collect();
        if parts.len() > 1 {
            let prefix = format!("{}.*", parts[0]);
            if self.permissions.contains(&prefix) {
                return true;
            }
        }

        false
    }
}
