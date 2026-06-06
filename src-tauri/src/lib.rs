use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
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
    display_language: Option<String>,
    fallback_language: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryState {
    templates: Vec<Value>,
    entries: Vec<Value>,
    initialized: bool,
}

const DEFAULT_LANGUAGE: &str = "zh";
const SUPPORTED_LANGUAGES: [&str; 9] = ["zh", "en", "ja", "ko", "it", "es", "de", "pt", "ru"];

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
        templates: read_templates(&root.join("templates"))?,
        entries: read_entries(&root.join("entries"))?,
        initialized,
    })
}

#[tauri::command]
fn save_template(library_dir: String, template: Value) -> Result<(), String> {
    let root = ensure_library(&library_dir)?;
    let id = required_json_string(&template, "id")?;
    validate_id(&id)?;
    let dir = root.join("templates").join(&id);
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create {:?}: {error}", dir))?;
    write_json(
        &dir.join("template.json"),
        &shared_template_value(&template),
    )?;
    write_language_files(
        &dir,
        template_language_payloads(&template)?,
        "template.json",
    )?;
    let legacy_path = root.join("templates").join(format!("{id}.json"));
    if legacy_path.exists() {
        fs::remove_file(&legacy_path)
            .map_err(|error| format!("Failed to delete {:?}: {error}", legacy_path))?;
    }
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
    let template_folder = root.join("templates").join(&template_id);
    if template_folder.exists() {
        fs::remove_dir_all(&template_folder)
            .map_err(|error| format!("Failed to delete {:?}: {error}", template_folder))?;
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
fn import_entry_images(
    library_dir: String,
    template_id: String,
    entry_id: String,
    field_id: String,
    source_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    validate_id(&template_id)?;
    validate_id(&entry_id)?;
    let root = ensure_library(&library_dir)?;
    let field_dir = sanitize_asset_stem(&field_id);
    let field_dir = if field_dir.is_empty() {
        "field".to_string()
    } else {
        field_dir
    };
    let target_dir = format!("entries/{template_id}/{entry_id}/assets/{field_dir}");
    let mut imported = Vec::with_capacity(source_paths.len());
    for (index, source_path) in source_paths.iter().enumerate() {
        imported.push(import_image_asset(
            &root,
            source_path,
            &target_dir,
            &format!("frame-{index}"),
        )?);
    }
    if !imported.is_empty() {
        mark_library_initialized(&root)?;
    }
    Ok(imported)
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
    let dir = root.join("entries").join(&template_id).join(&id);
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create {:?}: {error}", dir))?;
    write_json(&dir.join("entry.json"), &shared_entry_value(&entry))?;
    write_language_files(&dir, entry_language_payloads(&entry)?, "entry.json")?;
    let legacy_path = root
        .join("entries")
        .join(&template_id)
        .join(format!("{id}.json"));
    if legacy_path.exists() {
        fs::remove_file(&legacy_path)
            .map_err(|error| format!("Failed to delete {:?}: {error}", legacy_path))?;
    }
    mark_library_initialized(&root)
}

#[tauri::command]
fn delete_entry(library_dir: String, template_id: String, entry_id: String) -> Result<(), String> {
    validate_id(&template_id)?;
    validate_id(&entry_id)?;
    let root = ensure_library(&library_dir)?;
    let folder = root.join("entries").join(&template_id).join(&entry_id);
    if folder.exists() {
        fs::remove_dir_all(&folder)
            .map_err(|error| format!("Failed to delete {:?}: {error}", folder))?;
    }
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
    template_id: String,
    entry_id: String,
    file_name: String,
    markdown: String,
) -> Result<String, String> {
    validate_id(&template_id)?;
    validate_id(&entry_id)?;
    let root = ensure_library(&library_dir)?;
    let entry_dir = root.join("entries").join(template_id).join(&entry_id);
    fs::create_dir_all(&entry_dir)
        .map_err(|error| format!("Failed to create {:?}: {error}", entry_dir))?;
    let safe_name = sanitize_file_name(&file_name, &entry_id);
    let path = entry_dir.join(safe_name);
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
            import_entry_images,
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

fn import_image_asset(
    root: &Path,
    source_path: &str,
    target_dir: &str,
    prefix: &str,
) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(format!("Image file was not found: {source_path}"));
    }
    let ext = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Image file must have an image extension.".to_string())?;
    if !is_supported_image_extension(&ext) {
        return Err(format!("Unsupported image type: {ext}"));
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_asset_stem(value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "image".to_string());
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to create image timestamp: {error}"))?
        .as_millis();
    let prefix = sanitize_asset_stem(prefix);
    let relative = if prefix.is_empty() {
        format!("{target_dir}/{stamp}-{stem}.{ext}")
    } else {
        format!("{target_dir}/{prefix}-{stamp}-{stem}.{ext}")
    };
    let target = root.join(&relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {:?}: {error}", parent))?;
    }
    fs::copy(&source, &target)
        .map_err(|error| format!("Failed to copy image {:?}: {error}", source))?;
    Ok(relative)
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

fn is_supported_language(language: &str) -> bool {
    SUPPORTED_LANGUAGES.contains(&language)
}

fn file_stem_string(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(str::to_string)
}

fn file_name_string(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
}

fn language_code_from_path(path: &Path) -> Option<String> {
    file_stem_string(path).filter(|language| is_supported_language(language))
}

fn json_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
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
    Ok(files)
}

fn child_folders(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut folders = fs::read_dir(dir)
        .map_err(|error| format!("Failed to read {:?}: {error}", dir))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    folders.sort();
    Ok(folders)
}

fn object_without_keys(value: &Value, keys: &[&str]) -> Value {
    let object = value
        .as_object()
        .map(|source| {
            source
                .iter()
                .filter(|(key, _)| !keys.contains(&key.as_str()))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect::<Map<String, Value>>()
        })
        .unwrap_or_default();
    Value::Object(object)
}

fn shared_template_value(template: &Value) -> Value {
    object_without_keys(
        template,
        &[
            "name",
            "description",
            "fields",
            "markdownTemplate",
            "translations",
        ],
    )
}

fn shared_entry_value(entry: &Value) -> Value {
    object_without_keys(entry, &["title", "values", "translations"])
}

fn payload_from_keys(value: &Value, keys: &[&str]) -> Value {
    let mut payload = Map::new();
    if let Some(object) = value.as_object() {
        for key in keys {
            if let Some(field) = object.get(*key) {
                payload.insert((*key).to_string(), field.clone());
            }
        }
    }
    Value::Object(payload)
}

fn merge_payload(target: &mut Value, patch: &Value) -> Result<(), String> {
    let target = target
        .as_object_mut()
        .ok_or_else(|| "Language payload must be a JSON object.".to_string())?;
    let patch = patch
        .as_object()
        .ok_or_else(|| "Language payload must be a JSON object.".to_string())?;
    for (key, value) in patch {
        target.insert(key.clone(), value.clone());
    }
    Ok(())
}

fn translation_payload(value: &Value, language: &str) -> Result<Option<Value>, String> {
    let Some(translations) = value.get("translations") else {
        return Ok(None);
    };
    let translations = translations
        .as_object()
        .ok_or_else(|| "`translations` must be a JSON object.".to_string())?;
    let Some(payload) = translations.get(language) else {
        return Ok(None);
    };
    if !payload.is_object() {
        return Err(format!("Translation `{language}` must be a JSON object."));
    }
    Ok(Some(payload.clone()))
}

fn template_language_payloads(template: &Value) -> Result<Vec<(String, Value)>, String> {
    language_payloads(
        template,
        &["name", "description", "fields", "markdownTemplate"],
    )
}

fn entry_language_payloads(entry: &Value) -> Result<Vec<(String, Value)>, String> {
    language_payloads(entry, &["title", "values"])
}

fn language_payloads(value: &Value, default_keys: &[&str]) -> Result<Vec<(String, Value)>, String> {
    let mut payloads = Vec::new();
    for language in SUPPORTED_LANGUAGES {
        let mut payload = if language == DEFAULT_LANGUAGE {
            payload_from_keys(value, default_keys)
        } else {
            Value::Object(Map::new())
        };
        if let Some(translation) = translation_payload(value, language)? {
            merge_payload(&mut payload, &translation)?;
        }
        if language == DEFAULT_LANGUAGE
            || payload.as_object().is_some_and(|object| !object.is_empty())
        {
            payloads.push((language.to_string(), payload));
        }
    }
    Ok(payloads)
}

fn write_language_files(
    dir: &Path,
    payloads: Vec<(String, Value)>,
    shared_file_name: &str,
) -> Result<(), String> {
    let keep = payloads
        .iter()
        .map(|(language, _)| format!("{language}.json"))
        .collect::<Vec<_>>();
    for file in json_files(dir)? {
        let Some(file_name) = file_name_string(&file) else {
            continue;
        };
        if file_name == shared_file_name {
            continue;
        }
        if language_code_from_path(&file).is_some() && !keep.contains(&file_name) {
            fs::remove_file(&file)
                .map_err(|error| format!("Failed to delete {:?}: {error}", file))?;
        }
    }
    for (language, payload) in payloads {
        write_json(&dir.join(format!("{language}.json")), &payload)?;
    }
    Ok(())
}

fn read_templates(templates_dir: &Path) -> Result<Vec<Value>, String> {
    if !templates_dir.exists() {
        return Ok(Vec::new());
    }
    let mut templates = Vec::new();
    let mut folder_ids = Vec::new();
    for folder in child_folders(templates_dir)? {
        let template = read_template_folder(&folder)?;
        if let Some(id) = template.get("id").and_then(Value::as_str) {
            folder_ids.push(id.to_string());
        }
        templates.push(template);
    }
    for file in json_files(templates_dir)? {
        let mut template = read_json::<Value>(&file)?;
        let id = ensure_id_from_path(&mut template, &file)?;
        if !folder_ids.contains(&id) {
            templates.push(template);
        }
    }
    Ok(templates)
}

fn read_template_folder(folder: &Path) -> Result<Value, String> {
    let template_path = folder.join("template.json");
    let mut template = if template_path.exists() {
        read_json::<Value>(&template_path)?
    } else {
        Value::Object(Map::new())
    };
    ensure_id_from_path(&mut template, folder)?;
    apply_language_files(
        &mut template,
        folder,
        &["name", "description", "fields", "markdownTemplate"],
    )?;
    Ok(template)
}

fn read_entry_folder(folder: &Path, template_id: &str) -> Result<Value, String> {
    let entry_path = folder.join("entry.json");
    let mut entry = if entry_path.exists() {
        read_json::<Value>(&entry_path)?
    } else {
        Value::Object(Map::new())
    };
    ensure_id_from_path(&mut entry, folder)?;
    set_string_if_missing(&mut entry, "templateId", template_id.to_string());
    apply_language_files(&mut entry, folder, &["title", "values"])?;
    Ok(entry)
}

fn apply_language_files(
    value: &mut Value,
    dir: &Path,
    default_keys: &[&str],
) -> Result<(), String> {
    for file in json_files(dir)? {
        let Some(language) = language_code_from_path(&file) else {
            continue;
        };
        let payload = read_json::<Value>(&file)?;
        if !payload.is_object() {
            return Err(format!(
                "Language file {:?} must contain a JSON object.",
                file
            ));
        }
        if language == DEFAULT_LANGUAGE {
            apply_default_language_payload(value, &payload, default_keys)?;
        }
        set_translation_payload(value, &language, payload)?;
    }
    Ok(())
}

fn apply_default_language_payload(
    value: &mut Value,
    payload: &Value,
    keys: &[&str],
) -> Result<(), String> {
    let object = value_as_object_mut(value)?;
    let payload = payload
        .as_object()
        .ok_or_else(|| "Language payload must be a JSON object.".to_string())?;
    for key in keys {
        if let Some(field) = payload.get(*key) {
            object.insert((*key).to_string(), field.clone());
        }
    }
    Ok(())
}

fn set_translation_payload(
    value: &mut Value,
    language: &str,
    payload: Value,
) -> Result<(), String> {
    let object = value_as_object_mut(value)?;
    if !object
        .get("translations")
        .is_some_and(|translations| translations.is_object())
    {
        object.insert("translations".to_string(), Value::Object(Map::new()));
    }
    let translations = object
        .get_mut("translations")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "`translations` must be a JSON object.".to_string())?;
    translations.insert(language.to_string(), payload);
    Ok(())
}

fn ensure_id_from_path(value: &mut Value, path: &Path) -> Result<String, String> {
    let fallback = file_stem_string(path)
        .or_else(|| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(str::to_string)
        })
        .ok_or_else(|| format!("Failed to infer id from {:?}", path))?;
    let object = value_as_object_mut(value)?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or(fallback);
    object.insert("id".to_string(), Value::String(id.clone()));
    Ok(id)
}

fn set_string_if_missing(value: &mut Value, key: &str, text: String) {
    if let Some(object) = value.as_object_mut() {
        if !object.contains_key(key) {
            object.insert(key.to_string(), Value::String(text));
        }
    }
}

fn value_as_object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, String> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value
        .as_object_mut()
        .ok_or_else(|| "Expected JSON object.".to_string())
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
            entries.extend(read_template_entries(&dir)?);
        }
    }
    Ok(entries)
}

fn read_template_entries(template_dir: &Path) -> Result<Vec<Value>, String> {
    let template_id = template_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Failed to infer template id from {:?}", template_dir))?
        .to_string();
    let mut entries = Vec::new();
    let mut folder_ids = Vec::new();
    for folder in child_folders(template_dir)? {
        let entry = read_entry_folder(&folder, &template_id)?;
        if let Some(id) = entry.get("id").and_then(Value::as_str) {
            folder_ids.push(id.to_string());
        }
        entries.push(entry);
    }
    for file in json_files(template_dir)? {
        let mut entry = read_json::<Value>(&file)?;
        let id = ensure_id_from_path(&mut entry, &file)?;
        set_string_if_missing(&mut entry, "templateId", template_id.clone());
        if !folder_ids.contains(&id) {
            entries.push(entry);
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
                "description": "中文简介",
                "fields": [],
                "markdownTemplate": "# {{name}}",
                "translations": {
                    "en": {
                        "name": "Tile",
                        "description": "English description",
                        "fields": [],
                        "markdownTemplate": "# {{name}}"
                    }
                }
            }),
        )
        .expect("template should be saved");

        save_entry(
            library_dir.clone(),
            json!({
                "id": "entry-1",
                "templateId": "tile",
                "title": "攻击_近战_单体",
                "values": { "name": "攻击_近战_单体" },
                "translations": {
                    "en": {
                        "title": "Melee Attack",
                        "values": { "name": "Melee Attack" }
                    }
                }
            }),
        )
        .expect("entry should be saved");

        let exported = export_entry_markdown(
            library_dir.clone(),
            "tile".to_string(),
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
        let source_frame = root.join("source-frame.svg");
        fs::write(
            &source_frame,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>"#,
        )
        .expect("test frame should be written");
        let frame_assets = import_entry_images(
            library_dir.clone(),
            "tile".to_string(),
            "entry-1".to_string(),
            "preview".to_string(),
            vec![source_frame.to_string_lossy().to_string()],
        )
        .expect("entry image should be imported");
        let frame_data_url = read_library_asset(library_dir.clone(), frame_assets[0].clone())
            .expect("entry image should be readable");

        let loaded = load_library(library_dir).expect("library should load");
        assert_eq!(loaded.templates.len(), 1);
        assert_eq!(loaded.entries.len(), 1);
        assert!(loaded.initialized);
        assert_eq!(loaded.templates[0]["name"], "瓦片");
        assert_eq!(loaded.templates[0]["translations"]["en"]["name"], "Tile");
        assert_eq!(loaded.entries[0]["title"], "攻击_近战_单体");
        assert_eq!(
            loaded.entries[0]["translations"]["en"]["title"],
            "Melee Attack"
        );
        assert!(PathBuf::from(exported).exists());
        assert!(!root.join("templates").join("tile.json").exists());
        assert!(root
            .join("templates")
            .join("tile")
            .join("template.json")
            .exists());
        assert!(root.join("templates").join("tile").join("zh.json").exists());
        assert!(root.join("templates").join("tile").join("en.json").exists());
        let shared_template =
            read_json::<Value>(&root.join("templates").join("tile").join("template.json"))
                .expect("shared template json should load");
        assert!(shared_template.get("translations").is_none());
        assert!(shared_template.get("name").is_none());
        assert!(root.join("entries").join("tile").join("entry-1").is_dir());
        assert!(root
            .join("entries")
            .join("tile")
            .join("entry-1")
            .join("entry.json")
            .exists());
        assert!(root
            .join("entries")
            .join("tile")
            .join("entry-1")
            .join("zh.json")
            .exists());
        assert!(root
            .join("entries")
            .join("tile")
            .join("entry-1")
            .join("en.json")
            .exists());
        let shared_entry = read_json::<Value>(
            &root
                .join("entries")
                .join("tile")
                .join("entry-1")
                .join("entry.json"),
        )
        .expect("shared entry json should load");
        assert!(shared_entry.get("translations").is_none());
        assert!(shared_entry.get("values").is_none());
        assert!(shared_entry.get("title").is_none());
        assert!(root.join(icon_asset).exists());
        assert!(icon_data_url.starts_with("data:image/png;base64,"));
        assert!(root.join(&frame_assets[0]).exists());
        assert!(frame_assets[0].starts_with("entries/tile/entry-1/assets/preview/"));
        assert!(frame_data_url.starts_with("data:image/svg+xml;base64,"));

        fs::remove_dir_all(root).expect("test library should be cleaned");
    }
}
