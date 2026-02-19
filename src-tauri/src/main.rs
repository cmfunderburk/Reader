#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Local, Utc};
use keyring::{Entry, Error as KeyringError};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use url::Url;
use walkdir::WalkDir;

const SOURCES_FILE: &str = "library-sources.json";
const LIBRARY_MANIFEST_SCHEMA: &str = "reader-library-manifest";
const LIBRARY_MANIFEST_VERSION: u32 = 1;
const CORPUS_FAMILIES: [&str; 2] = ["wiki", "prose"];
const CORPUS_TIERS: [&str; 3] = ["easy", "medium", "hard"];
const SUPPORTED_BOOK_EXTENSIONS: [&str; 3] = ["pdf", "epub", "txt"];
const SUPPORTED_API_KEY_IDS: [&str; 1] = ["comprehension-gemini"];
const SECURE_KEYRING_SERVICE: &str = "com.cmf.reader";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibrarySource {
    name: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
struct LibraryItem {
    name: String,
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    size: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: f64,
    #[serde(rename = "parentDir", skip_serializing_if = "Option::is_none")]
    parent_dir: Option<String>,
    #[serde(rename = "isFrontmatter", skip_serializing_if = "Option::is_none")]
    is_frontmatter: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct ExtractedChapter {
    title: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct ExtractedContent {
    title: String,
    content: String,
    #[serde(rename = "sourcePath", skip_serializing_if = "Option::is_none")]
    source_path: Option<String>,
    #[serde(rename = "assetBaseUrl", skip_serializing_if = "Option::is_none")]
    asset_base_url: Option<String>,
    #[serde(rename = "pageCount", skip_serializing_if = "Option::is_none")]
    page_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chapters: Option<Vec<ExtractedChapter>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibraryManifestSource {
    name: String,
    #[serde(rename = "rootName")]
    root_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibraryManifestEntry {
    #[serde(rename = "sourceName")]
    source_name: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(
        rename = "normalizedTextRelativePath",
        skip_serializing_if = "Option::is_none"
    )]
    normalized_text_relative_path: Option<String>,
    size: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibraryManifest {
    schema: String,
    version: u32,
    #[serde(rename = "exportedAt")]
    exported_at: String,
    sources: Vec<LibraryManifestSource>,
    entries: Vec<LibraryManifestEntry>,
}

#[derive(Debug, Clone, Serialize)]
struct LibraryExportResult {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(rename = "sourceCount", skip_serializing_if = "Option::is_none")]
    source_count: Option<usize>,
    #[serde(rename = "entryCount", skip_serializing_if = "Option::is_none")]
    entry_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
struct LibraryImportSourceResult {
    #[serde(rename = "sourceName")]
    source_name: String,
    status: String,
    #[serde(rename = "resolvedPath", skip_serializing_if = "Option::is_none")]
    resolved_path: Option<String>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
struct LibraryImportResult {
    status: String,
    #[serde(rename = "manifestPath", skip_serializing_if = "Option::is_none")]
    manifest_path: Option<String>,
    #[serde(rename = "sharedRootPath", skip_serializing_if = "Option::is_none")]
    shared_root_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    added: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    existing: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    missing: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    results: Option<Vec<LibraryImportSourceResult>>,
}

#[derive(Debug, Clone)]
struct LibraryManifestImportSummary {
    added: usize,
    existing: usize,
    missing: usize,
    results: Vec<LibraryImportSourceResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CorpusArticle {
    title: String,
    text: String,
    domain: String,
    fk_grade: f64,
    words: u64,
    sentences: u64,
}

#[derive(Debug, Clone, Serialize)]
struct CorpusTierInfo {
    available: bool,
    #[serde(rename = "totalArticles")]
    total_articles: usize,
}

#[derive(Default)]
struct AppState {
    corpus_cache: Mutex<HashMap<String, Vec<CorpusArticle>>>,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    fs::create_dir_all(&base)
        .map_err(|err| format!("Failed to create app data directory: {err}"))?;
    Ok(base)
}

fn sources_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(SOURCES_FILE))
}

fn resolve_absolute_path(input_path: &str) -> PathBuf {
    let path = PathBuf::from(input_path);
    if path.is_absolute() {
        return path;
    }

    if let Ok(cwd) = std::env::current_dir() {
        return cwd.join(&path);
    }

    path
}

fn normalize_path(input_path: &str) -> Option<PathBuf> {
    fs::canonicalize(resolve_absolute_path(input_path)).ok()
}

fn normalize_path_for_compare(input_path: &str) -> PathBuf {
    let absolute = resolve_absolute_path(input_path);
    fs::canonicalize(&absolute).unwrap_or(absolute)
}

fn is_directory(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
}

fn load_sources(app: &AppHandle) -> Vec<LibrarySource> {
    let Ok(path) = sources_path(app) else {
        return vec![];
    };
    if !path.exists() {
        return vec![];
    }

    let Ok(raw) = fs::read_to_string(path) else {
        return vec![];
    };

    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_sources(app: &AppHandle, sources: &[LibrarySource]) -> Result<(), String> {
    let path = sources_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create sources directory: {err}"))?;
    }
    let payload = serde_json::to_string_pretty(sources)
        .map_err(|err| format!("Failed to serialize sources: {err}"))?;
    fs::write(path, payload).map_err(|err| format!("Failed to save library sources: {err}"))
}

fn is_within_root(target_path: &Path, root_path: &Path) -> bool {
    target_path == root_path || target_path.starts_with(root_path)
}

fn get_allowed_library_roots(app: &AppHandle) -> Vec<PathBuf> {
    load_sources(app)
        .into_iter()
        .filter_map(|source| normalize_path(&source.path))
        .collect()
}

fn resolve_allowed_library_path(app: &AppHandle, requested_path: &str) -> Result<PathBuf, String> {
    let normalized =
        normalize_path(requested_path).ok_or_else(|| "Path does not exist".to_string())?;
    let roots = get_allowed_library_roots(app);
    if roots.is_empty() {
        return Err("No library sources configured".to_string());
    }

    if !roots.iter().any(|root| is_within_root(&normalized, root)) {
        return Err("Path is outside configured library sources".to_string());
    }

    Ok(normalized)
}

fn is_frontmatter_filename(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    lower.starts_with("00-")
        || lower.starts_with("00_")
        || lower.contains("frontmatter")
        || lower.starts_with("cover.")
        || lower.starts_with("toc.")
        || lower.contains("table-of-contents")
        || lower.contains("table_of_contents")
        || lower.starts_with("title-page")
        || lower.starts_with("title_page")
        || lower.starts_with("copyright")
        || lower.starts_with("preface.")
        || lower.starts_with("foreword.")
        || lower.starts_with("acknowledgement")
        || lower.starts_with("dedication.")
        || lower.starts_with("half-title")
        || lower.starts_with("half_title")
}

fn normalize_path_fragment(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_manifest_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn scan_directory(root_path: &Path) -> Vec<LibraryItem> {
    let mut items: Vec<LibraryItem> = vec![];

    for entry in WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();
        let extension = file_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());
        let Some(extension) = extension else {
            continue;
        };

        if !SUPPORTED_BOOK_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|timestamp| timestamp.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as f64)
            .unwrap_or(0.0);

        let relative = file_path.strip_prefix(root_path).ok();
        let parent_dir = relative
            .and_then(|fragment| fragment.parent())
            .and_then(|parent| {
                if parent.as_os_str().is_empty() {
                    None
                } else {
                    Some(normalize_path_fragment(parent))
                }
            });

        let filename = entry.file_name().to_string_lossy().to_string();
        items.push(LibraryItem {
            name: filename.clone(),
            path: file_path.to_string_lossy().to_string(),
            item_type: extension,
            size: metadata.len(),
            modified_at,
            parent_dir,
            is_frontmatter: Some(is_frontmatter_filename(&filename)),
        });
    }

    items.sort_by(|a, b| {
        let parent_a = a.parent_dir.as_deref().unwrap_or("");
        let parent_b = b.parent_dir.as_deref().unwrap_or("");
        parent_a.cmp(parent_b).then_with(|| a.name.cmp(&b.name))
    });

    items
}

fn source_root_name(source_path: &str) -> String {
    let resolved = resolve_absolute_path(source_path);
    resolved
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .unwrap_or_else(|| "library".to_string())
}

fn resolve_normalized_text_snapshot(
    root_path: &Path,
    file_path: &Path,
    entry_type: &str,
) -> Option<String> {
    let relative_path = normalize_manifest_path(file_path.strip_prefix(root_path).ok()?);
    if entry_type == "txt" {
        return Some(relative_path);
    }

    let sidecar = file_path.with_extension("txt");
    if !sidecar.exists() || !sidecar.is_file() {
        return None;
    }
    let relative_sidecar = sidecar.strip_prefix(root_path).ok()?;
    Some(normalize_manifest_path(relative_sidecar))
}

fn build_library_manifest(sources: &[LibrarySource]) -> LibraryManifest {
    let mut entries: Vec<LibraryManifestEntry> = vec![];

    for source in sources {
        let Some(root_path) = normalize_path(&source.path) else {
            continue;
        };

        for item in scan_directory(&root_path) {
            let item_path = PathBuf::from(&item.path);
            let Ok(relative_path_raw) = item_path.strip_prefix(&root_path) else {
                continue;
            };
            if relative_path_raw.as_os_str().is_empty() {
                continue;
            }

            entries.push(LibraryManifestEntry {
                source_name: source.name.clone(),
                relative_path: normalize_manifest_path(relative_path_raw),
                entry_type: item.item_type.clone(),
                normalized_text_relative_path: resolve_normalized_text_snapshot(
                    &root_path,
                    &item_path,
                    &item.item_type,
                ),
                size: item.size,
                modified_at: item.modified_at,
            });
        }
    }

    LibraryManifest {
        schema: LIBRARY_MANIFEST_SCHEMA.to_string(),
        version: LIBRARY_MANIFEST_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        sources: sources
            .iter()
            .map(|source| LibraryManifestSource {
                name: source.name.clone(),
                root_name: source_root_name(&source.path),
            })
            .collect(),
        entries,
    }
}

fn save_library_manifest(manifest: &LibraryManifest, target_path: &Path) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create manifest directory: {err}"))?;
    }
    let payload = serde_json::to_string_pretty(manifest)
        .map_err(|err| format!("Failed to serialize manifest: {err}"))?;
    fs::write(target_path, payload).map_err(|err| format!("Failed to save manifest: {err}"))
}

fn is_manifest_entry_type(value: &str) -> bool {
    value == "pdf" || value == "epub" || value == "txt"
}

fn load_library_manifest(manifest_path: &Path) -> Result<LibraryManifest, String> {
    let raw = fs::read_to_string(manifest_path)
        .map_err(|err| format!("Failed to read manifest: {err}"))?;
    let parsed: LibraryManifest = serde_json::from_str(&raw)
        .map_err(|err| format!("Invalid manifest JSON payload: {err}"))?;

    if parsed.schema != LIBRARY_MANIFEST_SCHEMA || parsed.version != LIBRARY_MANIFEST_VERSION {
        return Err("Unsupported library manifest format".to_string());
    }

    for source in &parsed.sources {
        if source.name.trim().is_empty() || source.root_name.trim().is_empty() {
            return Err("Invalid manifest source entry".to_string());
        }
    }

    for entry in &parsed.entries {
        if entry.source_name.trim().is_empty()
            || entry.relative_path.trim().is_empty()
            || !is_manifest_entry_type(&entry.entry_type)
        {
            return Err("Invalid manifest content entry".to_string());
        }
    }

    Ok(parsed)
}

fn import_library_manifest(
    app: &AppHandle,
    manifest: &LibraryManifest,
    shared_root_path: &Path,
) -> Result<LibraryManifestImportSummary, String> {
    let shared_root = fs::canonicalize(shared_root_path)
        .map_err(|_| "Shared root is not a directory".to_string())?;
    if !is_directory(&shared_root) {
        return Err("Shared root is not a directory".to_string());
    }

    let mut results: Vec<LibraryImportSourceResult> = vec![];
    let mut added = 0usize;
    let mut existing = 0usize;
    let mut missing = 0usize;

    let mut updated_sources = load_sources(app);
    let mut known_paths: HashSet<PathBuf> = updated_sources
        .iter()
        .map(|source| normalize_path_for_compare(&source.path))
        .collect();

    for source in &manifest.sources {
        let expected_root = shared_root.join(&source.root_name);
        let resolved_path = if is_directory(&expected_root) {
            Some(fs::canonicalize(&expected_root).unwrap_or(expected_root))
        } else if manifest.sources.len() == 1 {
            Some(shared_root.clone())
        } else {
            None
        };

        let Some(resolved_path) = resolved_path else {
            missing += 1;
            results.push(LibraryImportSourceResult {
                source_name: source.name.clone(),
                status: "missing".to_string(),
                resolved_path: None,
                message: format!("Missing folder \"{}\" under shared root", source.root_name),
            });
            continue;
        };

        let entries_for_source: Vec<&LibraryManifestEntry> = manifest
            .entries
            .iter()
            .filter(|entry| entry.source_name == source.name)
            .collect();
        if !entries_for_source.is_empty() {
            let has_matching_file = entries_for_source
                .iter()
                .any(|entry| resolved_path.join(&entry.relative_path).exists());
            if !has_matching_file {
                missing += 1;
                results.push(LibraryImportSourceResult {
                    source_name: source.name.clone(),
                    status: "missing".to_string(),
                    resolved_path: Some(resolved_path.to_string_lossy().to_string()),
                    message: "No manifest files found under resolved folder".to_string(),
                });
                continue;
            }
        }

        if known_paths.contains(&resolved_path) {
            existing += 1;
            results.push(LibraryImportSourceResult {
                source_name: source.name.clone(),
                status: "existing".to_string(),
                resolved_path: Some(resolved_path.to_string_lossy().to_string()),
                message: "Source already configured".to_string(),
            });
            continue;
        }

        updated_sources.push(LibrarySource {
            name: source.name.clone(),
            path: resolved_path.to_string_lossy().to_string(),
        });
        known_paths.insert(resolved_path.clone());
        added += 1;
        results.push(LibraryImportSourceResult {
            source_name: source.name.clone(),
            status: "added".to_string(),
            resolved_path: Some(resolved_path.to_string_lossy().to_string()),
            message: "Source added".to_string(),
        });
    }

    save_sources(app, &updated_sources)?;

    Ok(LibraryManifestImportSummary {
        added,
        existing,
        missing,
        results,
    })
}

fn path_file_url(path: &Path) -> Option<String> {
    Url::from_directory_path(path)
        .ok()
        .map(|url| url.to_string())
}

fn format_title_from_path(file_path: &Path) -> String {
    file_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string())
}

fn read_text_file(file_path: &Path) -> Result<String, String> {
    fs::read_to_string(file_path)
        .map_err(|err| format!("Failed to read file {}: {err}", file_path.display()))
}

fn open_text_content(
    requested_path: &Path,
    content_path: &Path,
) -> Result<ExtractedContent, String> {
    let content = read_text_file(content_path)?;
    let asset_base_url = requested_path.parent().and_then(path_file_url);
    Ok(ExtractedContent {
        title: format_title_from_path(requested_path),
        content,
        source_path: Some(requested_path.to_string_lossy().to_string()),
        asset_base_url,
        page_count: None,
        chapters: None,
    })
}

fn parse_api_key_id(input: &str) -> Result<&'static str, String> {
    if SUPPORTED_API_KEY_IDS.contains(&input) {
        return Ok("comprehension-gemini");
    }
    Err(format!("Unsupported API key id: {input}"))
}

fn keyring_entry(key_id: &str) -> Result<Entry, String> {
    Entry::new(SECURE_KEYRING_SERVICE, key_id)
        .map_err(|err| format!("Failed to initialize secure storage entry: {err}"))
}

fn is_secure_api_key_storage_available() -> bool {
    let Ok(entry) = keyring_entry(SUPPORTED_API_KEY_IDS[0]) else {
        return false;
    };

    match entry.get_password() {
        Ok(_) => true,
        Err(KeyringError::NoEntry) => true,
        Err(_) => false,
    }
}

fn get_secure_api_key(key_id: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(key_id)?;
    match entry.get_password() {
        Ok(value) => {
            let normalized = value.trim();
            if normalized.is_empty() {
                Ok(None)
            } else {
                Ok(Some(normalized.to_string()))
            }
        }
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(format!("Failed to read secure API key: {err}")),
    }
}

fn set_secure_api_key(key_id: &str, value: Option<String>) -> Result<(), String> {
    let entry = keyring_entry(key_id)?;
    let normalized = value
        .as_deref()
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty());

    if let Some(secret) = normalized {
        entry
            .set_password(secret)
            .map_err(|err| format!("Failed to save secure API key: {err}"))?;
        return Ok(());
    }

    match entry.delete_credential() {
        Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(format!("Failed to delete secure API key: {err}")),
    }
}

fn corpus_key(family: &str, tier: &str) -> String {
    format!("{family}:{tier}")
}

fn corpus_candidate_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = vec![];

    if let Ok(base) = app_data_dir(app) {
        dirs.push(base.join("corpus"));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir.join("corpus"));
    }

    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("scripts").join("prepare-corpus"));
        dirs.push(cwd.join("..").join("scripts").join("prepare-corpus"));
    }

    dirs
}

fn find_corpus_path(app: &AppHandle, family: &str, tier: &str) -> Option<PathBuf> {
    let candidate_dirs = corpus_candidate_dirs(app);
    for dir in candidate_dirs {
        let explicit_family = dir.join(format!("corpus-{family}-{tier}.jsonl"));
        if explicit_family.exists() {
            return Some(explicit_family);
        }

        if family == "wiki" {
            let legacy = dir.join(format!("corpus-{tier}.jsonl"));
            if legacy.exists() {
                return Some(legacy);
            }
        }
    }
    None
}

fn ensure_corpus_loaded(
    state: &AppState,
    app: &AppHandle,
    family: &str,
    tier: &str,
) -> Result<bool, String> {
    let key = corpus_key(family, tier);

    {
        let cache = state
            .corpus_cache
            .lock()
            .map_err(|_| "Corpus cache lock poisoned".to_string())?;
        if cache.contains_key(&key) {
            return Ok(true);
        }
    }

    let Some(corpus_path) = find_corpus_path(app, family, tier) else {
        return Ok(false);
    };

    let Ok(content) = fs::read_to_string(corpus_path) else {
        return Ok(false);
    };

    let mut articles: Vec<CorpusArticle> = vec![];
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(article) = serde_json::from_str::<CorpusArticle>(line) {
            articles.push(article);
        }
    }

    let mut cache = state
        .corpus_cache
        .lock()
        .map_err(|_| "Corpus cache lock poisoned".to_string())?;
    cache.insert(key, articles);

    Ok(true)
}

#[tauri::command]
fn library_get_sources(app: AppHandle) -> Vec<LibrarySource> {
    load_sources(&app)
}

#[tauri::command]
fn library_list_books(app: AppHandle, dir_path: String) -> Result<Vec<LibraryItem>, String> {
    let allowed_path = resolve_allowed_library_path(&app, &dir_path)?;
    Ok(scan_directory(&allowed_path))
}

#[tauri::command]
fn library_open_book(app: AppHandle, file_path: String) -> Result<ExtractedContent, String> {
    let allowed_path = resolve_allowed_library_path(&app, &file_path)?;
    let extension = allowed_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| "Unsupported file type".to_string())?;

    if !SUPPORTED_BOOK_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Unsupported file type: .{extension}"));
    }

    if extension == "txt" {
        return open_text_content(&allowed_path, &allowed_path);
    }

    let sidecar_path = allowed_path.with_extension("txt");
    if sidecar_path.exists() && sidecar_path.is_file() {
        return open_text_content(&allowed_path, &sidecar_path);
    }

    Err(format!(
    "Unsupported file type: .{extension}. This bridge loads normalized .txt snapshots (plus adjacent assets such as figure/equation files). Add a normalized .txt file next to the source file."
  ))
}

#[tauri::command]
fn library_add_source(app: AppHandle, source: LibrarySource) -> Result<(), String> {
    let normalized_path =
        normalize_path(&source.path).ok_or_else(|| "Directory does not exist".to_string())?;
    if !is_directory(&normalized_path) {
        return Err("Library source must be a directory".to_string());
    }

    let mut sources = load_sources(&app);
    let normalized_string = normalized_path.to_string_lossy().to_string();
    let target_path = normalize_path_for_compare(&normalized_string);
    let already_exists = sources
        .iter()
        .any(|existing| normalize_path_for_compare(&existing.path) == target_path);
    if already_exists {
        return Ok(());
    }

    let fallback_name = normalized_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Library");
    let normalized_name = if source.name.trim().is_empty() {
        fallback_name.to_string()
    } else {
        source.name.trim().to_string()
    };

    sources.push(LibrarySource {
        name: normalized_name,
        path: normalized_string,
    });
    save_sources(&app, &sources)
}

#[tauri::command]
fn library_remove_source(app: AppHandle, source_path: String) -> Result<(), String> {
    let target = normalize_path_for_compare(&source_path);
    let mut sources = load_sources(&app);
    sources.retain(|source| normalize_path_for_compare(&source.path) != target);
    save_sources(&app, &sources)
}

#[tauri::command]
fn library_select_directory() -> Option<String> {
    FileDialog::new()
        .set_title("Select Library Directory")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn library_export_manifest(app: AppHandle) -> Result<LibraryExportResult, String> {
    let sources = load_sources(&app);
    if sources.is_empty() {
        return Err("No library sources configured".to_string());
    }

    let suggested_dir = dirs::document_dir()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let suggested_name = format!(
        "reader-library-manifest-{}.json",
        Local::now().format("%Y-%m-%d")
    );

    let save_path = FileDialog::new()
        .set_title("Export Library Manifest")
        .set_directory(&suggested_dir)
        .set_file_name(&suggested_name)
        .add_filter("JSON", &["json"])
        .save_file();

    let Some(save_path) = save_path else {
        return Ok(LibraryExportResult {
            status: "cancelled".to_string(),
            path: None,
            source_count: None,
            entry_count: None,
        });
    };

    let manifest = build_library_manifest(&sources);
    save_library_manifest(&manifest, &save_path)?;

    Ok(LibraryExportResult {
        status: "exported".to_string(),
        path: Some(save_path.to_string_lossy().to_string()),
        source_count: Some(manifest.sources.len()),
        entry_count: Some(manifest.entries.len()),
    })
}

#[tauri::command]
fn library_import_manifest(app: AppHandle) -> Result<LibraryImportResult, String> {
    let manifest_pick = FileDialog::new()
        .set_title("Select Library Manifest")
        .add_filter("JSON", &["json"])
        .pick_file();
    let Some(manifest_path) = manifest_pick else {
        return Ok(LibraryImportResult {
            status: "cancelled".to_string(),
            manifest_path: None,
            shared_root_path: None,
            added: None,
            existing: None,
            missing: None,
            results: None,
        });
    };

    let shared_root_pick = FileDialog::new()
        .set_title("Select Shared Library Root Folder")
        .pick_folder();
    let Some(shared_root_path) = shared_root_pick else {
        return Ok(LibraryImportResult {
            status: "cancelled".to_string(),
            manifest_path: None,
            shared_root_path: None,
            added: None,
            existing: None,
            missing: None,
            results: None,
        });
    };

    let manifest = load_library_manifest(&manifest_path)?;
    let summary = import_library_manifest(&app, &manifest, &shared_root_path)?;

    Ok(LibraryImportResult {
        status: "imported".to_string(),
        manifest_path: Some(manifest_path.to_string_lossy().to_string()),
        shared_root_path: Some(shared_root_path.to_string_lossy().to_string()),
        added: Some(summary.added),
        existing: Some(summary.existing),
        missing: Some(summary.missing),
        results: Some(summary.results),
    })
}

#[tauri::command]
fn secure_keys_is_available() -> bool {
    is_secure_api_key_storage_available()
}

#[tauri::command]
fn secure_keys_get(key_id: String) -> Result<Option<String>, String> {
    let valid_key_id = parse_api_key_id(&key_id)?;
    get_secure_api_key(valid_key_id)
}

#[tauri::command]
fn secure_keys_set(key_id: String, value: Option<String>) -> Result<(), String> {
    let valid_key_id = parse_api_key_id(&key_id)?;
    set_secure_api_key(valid_key_id, value)
}

#[tauri::command]
fn corpus_get_info(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HashMap<String, HashMap<String, CorpusTierInfo>>, String> {
    let mut output: HashMap<String, HashMap<String, CorpusTierInfo>> = HashMap::new();

    for family in CORPUS_FAMILIES {
        let mut tiers: HashMap<String, CorpusTierInfo> = HashMap::new();
        for tier in CORPUS_TIERS {
            let available = ensure_corpus_loaded(&state, &app, family, tier)?;
            let key = corpus_key(family, tier);
            let total_articles = state
                .corpus_cache
                .lock()
                .map_err(|_| "Corpus cache lock poisoned".to_string())?
                .get(&key)
                .map(|articles| articles.len())
                .unwrap_or(0);

            tiers.insert(
                tier.to_string(),
                CorpusTierInfo {
                    available,
                    total_articles,
                },
            );
        }
        output.insert(family.to_string(), tiers);
    }

    Ok(output)
}

#[tauri::command]
fn corpus_sample_article(
    app: AppHandle,
    state: State<'_, AppState>,
    family: String,
    tier: String,
) -> Result<Option<CorpusArticle>, String> {
    if !CORPUS_FAMILIES.contains(&family.as_str()) || !CORPUS_TIERS.contains(&tier.as_str()) {
        return Ok(None);
    }

    if !ensure_corpus_loaded(&state, &app, &family, &tier)? {
        return Ok(None);
    }

    let key = corpus_key(&family, &tier);
    let cache = state
        .corpus_cache
        .lock()
        .map_err(|_| "Corpus cache lock poisoned".to_string())?;
    let Some(articles) = cache.get(&key) else {
        return Ok(None);
    };
    if articles.is_empty() {
        return Ok(None);
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as usize;
    let index = now % articles.len();
    Ok(Some(articles[index].clone()))
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            library_get_sources,
            library_list_books,
            library_open_book,
            library_add_source,
            library_remove_source,
            library_select_directory,
            library_export_manifest,
            library_import_manifest,
            secure_keys_is_available,
            secure_keys_get,
            secure_keys_set,
            corpus_get_info,
            corpus_sample_article
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reader Tauri app");
}
