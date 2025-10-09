// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_compact_mode(window: tauri::Window) {
    tauri::api::shell::open(&std::env::current_dir().unwrap(), &std::path::PathBuf::from("http://localhost:1420/compact"), None).unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, open_compact_mode])
        .menu(tauri::Menu::os_default("rtodo"))
        .on_menu_event(|window, event| {
            if event.id == "open-compact-mode" {
                tauri::api::shell::open(&std::env::current_dir().unwrap(), &std::path::PathBuf::from("http://localhost:1420/compact"), None).unwrap();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
