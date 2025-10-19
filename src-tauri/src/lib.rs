use tauri::Manager;
use tauri::async_runtime;
use tracing::{info, instrument};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
#[instrument(skip(name))]
pub async fn greet(name: &str) -> String {
    // Offload any potential blocking work from the async executor
    let name = name.to_string();
    let res = async_runtime::spawn_blocking(move || {
        format!("Hello, {}! You've been greeted from Rust!", name)
    })
    .await
    .unwrap_or_else(|_| "Hello!".to_string());

    res
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber with env filter support.
    // Set RUST_LOG=info,tauri=warn to adjust verbosity in development.
    let filter_layer = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=warn,wry=warn"));
    tracing_subscriber::fmt()
        .with_env_filter(filter_layer)
        .compact()
        .init();

    info!("Starting Tauri application");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.webview_windows().get("main") {
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
