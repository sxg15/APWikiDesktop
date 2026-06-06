use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    library_dir: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryState {
    templates: Vec<Value>,
    entries: Vec<Value>,
    initialized: bool,
}

#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    read_json(&path)
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    write_json(&path, &settings)
}

#[tauri::command]
fn load_library(library_dir: String) -> Result<LibraryState, String> {
    let initialized = library_initialized(&library_dir);
    let root = ensure_library(&library_dir)?;
    Ok(LibraryState {
        templates: read_json_folder(&root.join("templates"))?,
        entries: read_entries(&root.join("entries"))?,
        initialized,
    })
}

#[tauri::command]
fn save_template(library_dir: String, template: Value) -> Result<(), String> {
    let root = ensure_library(&library_dir)?;
    let id = required_json_string(&template, "id")?;
    validate_id(&id)?;
    write_json(
        &root.join("templates").join(format!("{id}.json")),
        &template,
    )?;
    mark_library_initialized(&root)
}

#[tauri::command]
fn delete_template(library_dir: String, template_id: String) -> Result<(), String> {
    validate_id(&template_id)?;
    let root = ensure_library(&library_dir)?;
    let path = root.join("templates").join(format!("{template_id}.json"));
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("Failed to delete {:?}: {error}", path))?;
    }
    let entries = root.join("entries").join(template_id);
    if entries.exists() {
        fs::remove_dir_all(&entries)
            .map_err(|error| format!("Failed to delete {:?}: {error}", entries))?;
    }
    mark_library_initialized(&root)?;
    Ok(())
}

#[tauri::command]
fn import_template_icon(
    library_dir: String,
    template_id: String,
    source_path: String,
) -> Result<String, String> {
    validate_id(&template_id)?;
    let root = ensure_library(&library_dir)?;
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(format!("Icon file was not found: {source_path}"));
    }
    let ext = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Icon file must have an image extension.".to_string())?;
    if !is_supported_image_extension(&ext) {
        return Err(format!("Unsupported image type: {ext}"));
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_asset_stem(value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "icon".to_string());
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to create icon timestamp: {error}"))?
        .as_millis();
    let relative = format!("assets/type-icons/{template_id}-{stamp}-{stem}.{ext}");
    let target = root.join(&relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {:?}: {error}", parent))?;
    }
    fs::copy(&source, &target)
        .map_err(|error| format!("Failed to copy icon {:?}: {error}", source))?;
    mark_library_initialized(&root)?;
    Ok(relative)
}

#[tauri::command]
fn read_library_asset(library_dir: String, asset_path: String) -> Result<String, String> {
    let root = ensure_library(&library_dir)?;
    let path = resolve_library_asset(&root, &asset_path)?;
    let bytes = fs::read(&path).map_err(|error| format!("Failed to read {:?}: {error}", path))?;
    let mime = image_mime_type(&path)?;
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn save_entry(library_dir: String, entry: Value) -> Result<(), String> {
    let root = ensure_library(&library_dir)?;
    let id = required_json_string(&entry, "id")?;
    let template_id = required_json_string(&entry, "templateId")?;
    validate_id(&id)?;
    validate_id(&template_id)?;
    let dir = root.join("entries").join(&template_id);
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create {:?}: {error}", dir))?;
    write_json(&dir.join(format!("{id}.json")), &entry)?;
    mark_library_initialized(&root)
}

#[tauri::command]
fn delete_entry(library_dir: String, template_id: String, entry_id: String) -> Result<(), String> {
    validate_id(&template_id)?;
    validate_id(&entry_id)?;
    let root = ensure_library(&library_dir)?;
    let path = root
        .join("entries")
        .join(template_id)
        .join(format!("{entry_id}.json"));
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("Failed to delete {:?}: {error}", path))?;
    }
    Ok(())
}

#[tauri::command]
fn export_entry_markdown(
    library_dir: String,
    entry_id: String,
    file_name: String,
    markdown: String,
) -> Result<String, String> {
    let root = ensure_library(&library_dir)?;
    let exports = root.join("exports");
    fs::create_dir_all(&exports)
        .map_err(|error| format!("Failed to create {:?}: {error}", exports))?;
    let safe_name = sanitize_file_name(&file_name, &entry_id);
    let path = exports.join(safe_name);
    fs::write(&path, markdown).map_err(|error| format!("Failed to write {:?}: {error}", path))?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            load_library,
            save_template,
            delete_template,
            import_template_icon,
            read_library_asset,
            save_entry,
            delete_entry,
            export_entry_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn settings_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| format!("Failed to locate exe: {error}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Failed to locate exe folder.".to_string())?;
    Ok(dir.join("APWikiDesktop.settings.json"))
}

fn ensure_library(library_dir: &str) -> Result<PathBuf, String> {
    if library_dir.trim().is_empty() {
        return Err("Library directory is empty.".to_string());
    }
    let root = PathBuf::from(library_dir);
    fs::create_dir_all(root.join("templates"))
        .map_err(|error| format!("Failed to create templates folder: {error}"))?;
    fs::create_dir_all(root.join("entries"))
        .map_err(|error| format!("Failed to create entries folder: {error}"))?;
    fs::create_dir_all(root.join("exports"))
        .map_err(|error| format!("Failed to create exports folder: {error}"))?;
    Ok(root)
}

fn library_initialized(library_dir: &str) -> bool {
    let root = PathBuf::from(library_dir);
    root.join(".apwiki-library.json").exists()
        || root.join("templates").exists()
        || root.join("entries").exists()
}

fn mark_library_initialized(root: &Path) -> Result<(), String> {
    write_json(
        &root.join(".apwiki-library.json"),
        &serde_json::json!({ "initialized": true }),
    )
}

fn resolve_library_asset(root: &Path, asset_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(asset_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Asset path must stay inside the library.".to_string());
    }
    let root = root
        .canonicalize()
        .map_err(|error| format!("Failed to locate library folder: {error}"))?;
    let path = root.join(relative);
    let path = path
        .canonicalize()
        .map_err(|error| format!("Failed to locate asset {:?}: {error}", path))?;
    if !path.starts_with(&root) {
        return Err("Asset path must stay inside the library.".to_string());
    }
    Ok(path)
}

fn is_supported_image_extension(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg")
}

fn image_mime_type(path: &Path) -> Result<&'static str, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Ok("image/png"),
        Some("jpg") | Some("jpeg") => Ok("image/jpeg"),
        Some("webp") => Ok("image/webp"),
        Some("gif") => Ok("image/gif"),
        Some("svg") => Ok("image/svg+xml"),
        Some(ext) => Err(format!("Unsupported image type: {ext}")),
        None => Err("Icon file must have an image extension.".to_string()),
    }
}

fn sanitize_asset_stem(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn read_json_folder(dir: &Path) -> Result<Vec<Value>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(dir)
        .map_err(|error| format!("Failed to read {:?}: {error}", dir))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect::<Vec<_>>();
    files.sort();
    files.into_iter().map(|path| read_json(&path)).collect()
}

fn read_entries(entries_dir: &Path) -> Result<Vec<Value>, String> {
    if !entries_dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for dir in fs::read_dir(entries_dir)
        .map_err(|error| format!("Failed to read {:?}: {error}", entries_dir))?
    {
        let dir = dir
            .map_err(|error| format!("Failed to read entry folder: {error}"))?
            .path();
        if dir.is_dir() {
            entries.extend(read_json_folder(&dir)?);
        }
    }
    Ok(entries)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let text =
        fs::read_to_string(path).map_err(|error| format!("Failed to read {:?}: {error}", path))?;
    serde_json::from_str(&text).map_err(|error| format!("Invalid JSON in {:?}: {error}", path))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {:?}: {error}", parent))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize JSON: {error}"))?;
    let mut file =
        fs::File::create(path).map_err(|error| format!("Failed to write {:?}: {error}", path))?;
    file.write_all(text.as_bytes())
        .map_err(|error| format!("Failed to write {:?}: {error}", path))
}

fn required_json_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("JSON field `{key}` is required."))
}

fn validate_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid id: {id}"))
    }
}

fn sanitize_file_name(file_name: &str, fallback: &str) -> String {
    let raw = if file_name.trim().is_empty() {
        format!("{fallback}.md")
    } else {
        file_name.to_string()
    };
    let mut safe = raw
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();
    if !safe.to_lowercase().ends_with(".md") {
        safe.push_str(".md");
    }
    safe
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn saves_loads_and_exports_library_files() {
        let root = std::env::temp_dir().join(format!("apwiki-desktop-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let library_dir = root.to_string_lossy().to_string();

        save_template(
            library_dir.clone(),
            json!({
                "id": "tile",
                "name": "瓦片",
                "fields": [],
                "markdownTemplate": "# {{name}}"
            }),
        )
        .expect("template should be saved");

        save_entry(
            library_dir.clone(),
            json!({
                "id": "entry-1",
                "templateId": "tile",
                "title": "攻击_近战_单体",
                "values": { "name": "攻击_近战_单体" }
            }),
        )
        .expect("entry should be saved");

        let exported = export_entry_markdown(
            library_dir.clone(),
            "entry-1".to_string(),
            "攻击_近战_单体.md".to_string(),
            "# 攻击_近战_单体".to_string(),
        )
        .expect("markdown should be exported");
        let source_icon = root.join("source-icon.png");
        fs::write(&source_icon, [137, 80, 78, 71]).expect("test icon should be written");
        let icon_asset = import_template_icon(
            library_dir.clone(),
            "tile".to_string(),
            source_icon.to_string_lossy().to_string(),
        )
        .expect("icon should be imported");
        let icon_data_url = read_library_asset(library_dir.clone(), icon_asset.clone())
            .expect("icon should be readable");

        let loaded = load_library(library_dir).expect("library should load");
        assert_eq!(loaded.templates.len(), 1);
        assert_eq!(loaded.entries.len(), 1);
        assert!(loaded.initialized);
        assert!(PathBuf::from(exported).exists());
        assert!(root.join(icon_asset).exists());
        assert!(icon_data_url.starts_with("data:image/png;base64,"));

        fs::remove_dir_all(root).expect("test library should be cleaned");
    }
}
