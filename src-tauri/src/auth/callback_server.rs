use axum::{
    extract::Query,
    http::StatusCode,
    response::Html,
    routing::get,
    Router,
};
use tauri::Emitter;
use std::collections::HashMap;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;

pub struct CallbackServer;

impl CallbackServer {
    pub async fn start(
        port: u16,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let app_handle = Arc::new(app_handle);
        let app_handle_clone = app_handle.clone();

        let app = Router::new()
            .route(
                "/callback",
                get(move |query: Query<HashMap<String, String>>| {
                    let app_handle = app_handle_clone.clone();
                    async move {
                        let code = query.get("code").cloned();
                        let state = query.get("state").cloned();

                        if let (Some(code), Some(state)) = (code, state) {
                            println!("Callback received: code={}, state={}", code, state);
                            let app_handle_inner = (*app_handle).clone();
                            let callback_url = format!("http://localhost:{}/callback", port);
                            tauri::async_runtime::spawn(async move {
                                println!("Processing OAuth callback...");
                                match crate::handle_oauth_callback(
                                    app_handle_inner.clone(),
                                    code,
                                    state,
                                    &callback_url,
                                )
                                .await
                                {
                                    Ok(_) => {
                                        println!("OAuth callback processed successfully");
                                    }
                                    Err(e) => {
                                        eprintln!("OAuth callback error: {}", e);
                                        let _ = app_handle_inner.emit("auth-error", e.to_string());
                                    }
                                }
                            });

                            Ok::<_, StatusCode>(Html(
                                r#"
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <title>Authentication Successful</title>
                                    <style>
                                        body {
                                            font-family: Arial, sans-serif;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            height: 100vh;
                                            margin: 0;
                                            background: #f0f0f0;
                                        }
                                        .container {
                                            text-align: center;
                                            background: white;
                                            padding: 2rem;
                                            border-radius: 8px;
                                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                        }
                                        h1 { color: #4CAF50; }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h1>✓ Authentication Successful!</h1>
                                        <p>You can close this window and return to the application.</p>
                                    </div>
                                </body>
                                </html>
                                "#,
                            ))
                        } else {
                            Ok(Html(
                                r#"
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <title>Authentication Error</title>
                                    <style>
                                        body {
                                            font-family: Arial, sans-serif;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            height: 100vh;
                                            margin: 0;
                                            background: #f0f0f0;
                                        }
                                        .container {
                                            text-align: center;
                                            background: white;
                                            padding: 2rem;
                                            border-radius: 8px;
                                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                        }
                                        h1 { color: #f44336; }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h1>✗ Authentication Error</h1>
                                        <p>Missing code or state parameter.</p>
                                    </div>
                                </body>
                                </html>
                                "#,
                            ))
                        }
                    }
                }),
            )
            .layer(ServiceBuilder::new().layer(CorsLayer::permissive()));

        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        let listener = tokio::net::TcpListener::bind(addr).await?;

        axum::serve(listener, app).await?;

        Ok(())
    }
}

