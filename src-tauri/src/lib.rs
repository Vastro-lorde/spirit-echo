use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      export_transcript,
      get_app_data_dir,
      get_model_cache_size,
      clear_model_cache,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Export a transcript to a user-chosen file via native save dialog.
#[tauri::command]
async fn export_transcript(
  app: tauri::AppHandle,
  content: String,
  filename: Option<String>,
) -> Result<String, String> {
  let default_name = filename.unwrap_or_else(|| {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_secs())
      .unwrap_or(0);
    format!("transcript-{}.txt", timestamp)
  });

  use tauri_plugin_dialog::DialogExt;

  let file_path = app
    .dialog()
    .file()
    .add_filter("Text Files", &["txt", "md"])
    .add_filter("JSON Files", &["json"])
    .add_filter("All Files", &["*"])
    .set_file_name(&default_name)
    .blocking_save_file();

  match file_path {
    Some(path) => {
      let path_buf = path.as_path().unwrap().to_path_buf();
      fs::write(&path_buf, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
      Ok(path_buf.to_string_lossy().to_string())
    }
    None => Err("Save cancelled by user".to_string()),
  }
}

/// Get the app's local data directory (for model storage, etc.).
#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
  let path = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
  Ok(path.to_string_lossy().to_string())
}

/// Get the total size of cached model files in bytes.
#[tauri::command]
fn get_model_cache_size(app: tauri::AppHandle) -> Result<u64, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

  let models_dir = data_dir.join("models");
  if !models_dir.exists() {
    return Ok(0);
  }

  dir_size(&models_dir).map_err(|e| format!("Failed to calculate cache size: {}", e))
}

/// Clear all cached model files.
#[tauri::command]
fn clear_model_cache(app: tauri::AppHandle) -> Result<u64, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

  let models_dir = data_dir.join("models");
  if !models_dir.exists() {
    return Ok(0);
  }

  let size_before = dir_size(&models_dir).unwrap_or(0);
  fs::remove_dir_all(&models_dir)
    .map_err(|e| format!("Failed to clear model cache: {}", e))?;

  Ok(size_before)
}

/// Recursively calculate directory size.
fn dir_size(path: &PathBuf) -> std::io::Result<u64> {
  let mut total: u64 = 0;
  for entry in fs::read_dir(path)? {
    let entry = entry?;
    let metadata = entry.metadata()?;
    if metadata.is_dir() {
      total += dir_size(&entry.path())?;
    } else {
      total += metadata.len();
    }
  }
  Ok(total)
}
