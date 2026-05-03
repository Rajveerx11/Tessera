//! Project-folder discovery and classification.
//!
//! Walks a user-supplied project root, applies extension allow-list +
//! `.gitignore` filtering + size caps + path-traversal guards, and
//! returns a classified manifest of source / config / test / docs files.
//!
//! Per `rules.md` §9 (security at trust boundaries):
//! - **No execution of uploaded code.** This module reads metadata and
//!   text only.
//! - Extensions are **allow-listed**, never blacklisted.
//! - Size limits hard-cap per file, total, and file-count to prevent
//!   resource exhaustion via crafted input.
//! - Symbolic links escaping the project root are rejected; paths are
//!   canonicalized and verified to live under `project_root`.

use std::collections::HashSet;
use std::path::Path;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Maximum size of any single file accepted by the pipeline (50 MiB).
pub const MAX_FILE_SIZE_BYTES: u64 = 50 * 1024 * 1024;

/// Maximum total size of all accepted files in a project (500 MiB).
pub const MAX_PROJECT_SIZE_BYTES: u64 = 500 * 1024 * 1024;

/// Maximum file count per project. Above this we refuse to ingest the
/// project rather than silently truncate.
pub const MAX_FILE_COUNT: usize = 10_000;

/// File-type classification used downstream by the chunker and prompt
/// templates. Granularity matches what the artifact-generation prompts
/// will branch on; resist adding more categories without a need.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    /// Source code we can AST-parse (Tree-sitter grammar available).
    Source,
    /// Configuration: package.json, tsconfig.json, .toml, etc.
    Config,
    /// Test code (filename / path pattern matches a known convention).
    Test,
    /// Documentation: .md, .mdx, .rst, .txt at the root or under docs.
    Documentation,
}

/// Source-language tag attached to [`FileType::Source`] entries. Used by
/// the AST service to pick the right Tree-sitter grammar; covers only
/// what Phase 3 ships. Other languages return `Unknown` and skip
/// AST-level analysis (still indexable for embeddings).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceLanguage {
    JavaScript,
    TypeScript,
    Python,
    Unknown,
}

/// One discovered file with its classification + metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredFile {
    /// Path relative to the project root, using `/` separators on every
    /// platform (so persisted manifests are portable).
    pub relative_path: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Classification.
    pub file_type: FileType,
    /// Language tag — meaningful for `FileType::Source`, otherwise
    /// `Unknown`.
    pub language: SourceLanguage,
}

/// Aggregated discovery result.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiscoveryReport {
    pub files: Vec<DiscoveredFile>,
    pub total_size_bytes: u64,
}

/// Walk `project_root` and return every accepted file with its
/// classification.
///
/// # Errors
///
/// - [`AppError::InvalidInput`] if the path does not exist, is not a
///   directory, or canonicalization fails.
/// - [`AppError::LimitExceeded`] if the project exceeds
///   [`MAX_FILE_COUNT`] or [`MAX_PROJECT_SIZE_BYTES`].
/// - [`AppError::Io`] if the directory walker hits an unrecoverable
///   filesystem error.
pub fn discover(project_root: impl AsRef<Path>) -> AppResult<DiscoveryReport> {
    let root_raw = project_root.as_ref();
    if !root_raw.exists() {
        return Err(AppError::InvalidInput(format!(
            "project root does not exist: {}",
            root_raw.display()
        )));
    }
    if !root_raw.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "project root is not a directory: {}",
            root_raw.display()
        )));
    }
    let root = root_raw
        .canonicalize()
        .map_err(|e| AppError::InvalidInput(format!("cannot canonicalize project root: {e}")))?;

    let mut builder = WalkBuilder::new(&root);
    builder
        .hidden(false) // allow .env.example, .gitignore tracking
        .git_ignore(true)
        .git_global(false)
        .git_exclude(false)
        .ignore(true)
        .parents(false)
        .follow_links(false); // never traverse symlinks
                              // Honor `.gitignore` even when the project is not yet a git repo.
                              // `git_ignore(true)` alone needs a `.git` directory to activate;
                              // registering `.gitignore` as a generic ignore filename means a
                              // user-uploaded folder gets the same filtering whether or not it
                              // has been `git init`ed.
    builder.add_custom_ignore_filename(".gitignore");
    let walker = builder.build();

    let mut report = DiscoveryReport::default();
    let mut seen: HashSet<String> = HashSet::new();

    for entry in walker {
        let entry = entry.map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        let metadata = entry
            .metadata()
            .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        if !metadata.is_file() {
            continue;
        }

        let path = entry.path();

        // Path-traversal guard. canonicalize() resolves any symlinks
        // and `..` segments; if the result escapes the canonical root,
        // skip the entry. We do not error — symlinks pointing outside
        // the project legitimately appear in some toolchains (e.g.
        // npm-linked deps); we just ignore them here.
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if !canonical.starts_with(&root) {
            continue;
        }

        let relative = relative_path(&root, &canonical);
        if seen.contains(&relative) {
            continue;
        }

        let size = metadata.len();
        if size > MAX_FILE_SIZE_BYTES {
            // Skip oversize files quietly — analysis is best-effort
            // and the limit's purpose is denial-of-service prevention,
            // not a hard failure for the user's whole project.
            continue;
        }

        let Some(classification) = classify(&relative) else {
            continue;
        };

        seen.insert(relative.clone());
        report.total_size_bytes = report.total_size_bytes.saturating_add(size);
        report.files.push(DiscoveredFile {
            relative_path: relative,
            size_bytes: size,
            file_type: classification.0,
            language: classification.1,
        });

        if report.files.len() > MAX_FILE_COUNT {
            return Err(AppError::LimitExceeded(format!(
                "project exceeds the {MAX_FILE_COUNT}-file cap"
            )));
        }
        if report.total_size_bytes > MAX_PROJECT_SIZE_BYTES {
            return Err(AppError::LimitExceeded(format!(
                "project exceeds the {MAX_PROJECT_SIZE_BYTES}-byte cap"
            )));
        }
    }

    // Sort for deterministic output regardless of filesystem order.
    report
        .files
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(report)
}

/// Compute a project-relative path with `/` separators on every
/// platform. Not in `std` because Windows uses `\` natively.
fn relative_path(root: &Path, full: &Path) -> String {
    let stripped = full.strip_prefix(root).unwrap_or(full);
    stripped
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

/// Classify a relative path. Returns `None` for files we don't accept
/// (extension not on the allow-list, etc.).
fn classify(relative: &str) -> Option<(FileType, SourceLanguage)> {
    let lower = relative.to_lowercase();
    let ext = file_extension(&lower);

    if let Some(language) = source_language(ext) {
        let ftype = if is_test_path(&lower) {
            FileType::Test
        } else {
            FileType::Source
        };
        return Some((ftype, language));
    }

    if is_config_extension(ext) || is_config_filename(&lower) {
        return Some((FileType::Config, SourceLanguage::Unknown));
    }

    if is_documentation(&lower, ext) {
        return Some((FileType::Documentation, SourceLanguage::Unknown));
    }

    None
}

fn file_extension(lower: &str) -> &str {
    lower.rsplit_once('.').map_or("", |(_, ext)| ext)
}

fn source_language(ext: &str) -> Option<SourceLanguage> {
    match ext {
        "js" | "jsx" | "mjs" | "cjs" => Some(SourceLanguage::JavaScript),
        "ts" | "tsx" | "mts" | "cts" => Some(SourceLanguage::TypeScript),
        "py" | "pyi" => Some(SourceLanguage::Python),
        _ => None,
    }
}

fn is_config_extension(ext: &str) -> bool {
    matches!(
        ext,
        "json" | "jsonc" | "yaml" | "yml" | "toml" | "ini" | "env"
    )
}

fn is_config_filename(lower: &str) -> bool {
    let basename = lower.rsplit_once('/').map_or(lower, |(_, base)| base);
    matches!(
        basename,
        "package.json"
            | "tsconfig.json"
            | "cargo.toml"
            | "cargo.lock"
            | "pyproject.toml"
            | "setup.py"
            | "setup.cfg"
            | "requirements.txt"
            | ".env"
            | ".env.example"
            | "dockerfile"
            | "makefile"
    )
}

fn is_test_path(lower: &str) -> bool {
    lower.contains("/test/")
        || lower.contains("/tests/")
        || lower.contains("/__tests__/")
        || lower.contains(".test.")
        || lower.contains(".spec.")
        || lower.starts_with("test_")
        || lower.contains("/test_")
}

fn is_documentation(lower: &str, ext: &str) -> bool {
    matches!(ext, "md" | "mdx" | "rst" | "txt") || lower == "readme" || lower.ends_with("/readme")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Create an isolated tmp dir for one test. Caller deletes when done.
    fn tmp_root() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("testing-ide-disc-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create tmp dir");
        path
    }

    fn write(path: &Path, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdirs");
        }
        fs::write(path, contents).expect("write");
    }

    #[test]
    fn rejects_missing_root() {
        let err = discover("Z:/definitely/not/here").expect_err("must reject");
        assert_eq!(err.code(), "INVALID_INPUT");
    }

    #[test]
    fn rejects_file_root() {
        let f = tmp_root().join("file.txt");
        write(&f, b"hi");
        let err = discover(&f).expect_err("must reject file as root");
        assert_eq!(err.code(), "INVALID_INPUT");
        let _ = fs::remove_file(&f);
    }

    #[test]
    fn classifies_source_files() {
        let root = tmp_root();
        write(&root.join("src/main.ts"), b"export const x = 1;");
        write(&root.join("src/util.py"), b"def f(): pass\n");
        write(&root.join("README.md"), b"# project\n");

        let report = discover(&root).expect("discover");
        assert_eq!(report.files.len(), 3);

        let by_path: std::collections::HashMap<_, _> = report
            .files
            .iter()
            .map(|f| (f.relative_path.clone(), f))
            .collect();

        assert_eq!(by_path["README.md"].file_type, FileType::Documentation);
        assert_eq!(by_path["src/main.ts"].file_type, FileType::Source);
        assert_eq!(by_path["src/main.ts"].language, SourceLanguage::TypeScript);
        assert_eq!(by_path["src/util.py"].file_type, FileType::Source);
        assert_eq!(by_path["src/util.py"].language, SourceLanguage::Python);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn classifies_test_path_as_test_not_source() {
        let root = tmp_root();
        write(&root.join("src/util.py"), b"def f(): pass");
        write(&root.join("tests/test_util.py"), b"def test_f(): pass");
        write(&root.join("__tests__/foo.test.ts"), b"export {}");

        let report = discover(&root).expect("discover");
        let by_path: std::collections::HashMap<_, _> = report
            .files
            .iter()
            .map(|f| (f.relative_path.clone(), f.file_type))
            .collect();

        assert_eq!(by_path["src/util.py"], FileType::Source);
        assert_eq!(by_path["tests/test_util.py"], FileType::Test);
        assert_eq!(by_path["__tests__/foo.test.ts"], FileType::Test);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn classifies_known_config_filenames() {
        let root = tmp_root();
        write(&root.join("package.json"), b"{}");
        write(&root.join("tsconfig.json"), b"{}");
        write(&root.join(".env.example"), b"KEY=value");
        write(&root.join("Dockerfile"), b"FROM rust");
        write(&root.join("Makefile"), b"all:\n");

        let report = discover(&root).expect("discover");
        assert_eq!(report.files.len(), 5);
        assert!(report.files.iter().all(|f| f.file_type == FileType::Config));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_unrecognized_extensions() {
        let root = tmp_root();
        write(&root.join("a.ts"), b"export {}");
        write(&root.join("b.exe"), &[0u8; 16]); // binary, not on allow-list
        write(&root.join("c.bin"), &[0u8; 16]);

        let report = discover(&root).expect("discover");
        assert_eq!(report.files.len(), 1);
        assert_eq!(report.files[0].relative_path, "a.ts");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn respects_gitignore() {
        let root = tmp_root();
        write(&root.join(".gitignore"), b"node_modules/\nbuild/\n");
        write(&root.join("src/app.ts"), b"export {}");
        write(&root.join("node_modules/lib/x.js"), b"module.exports = {}");
        write(&root.join("build/output.js"), b"// built");

        let report = discover(&root).expect("discover");
        let paths: Vec<_> = report
            .files
            .iter()
            .map(|f| f.relative_path.as_str())
            .collect();

        assert!(paths.contains(&"src/app.ts"));
        assert!(!paths.iter().any(|p| p.starts_with("node_modules/")));
        assert!(!paths.iter().any(|p| p.starts_with("build/")));

        fs::remove_dir_all(&root).ok();
    }

    // The size-cap I/O path (writing a 50+ MiB scratch file) belongs
    // in the Phase 7 `tests/` integration suite — exercising it here
    // would burn ~50 MiB of disk on every `cargo test` invocation.
    // Constants are validated by const-eval below (compile-time).
    const _: () = {
        assert!(MAX_FILE_SIZE_BYTES > 0);
        assert!(MAX_PROJECT_SIZE_BYTES > MAX_FILE_SIZE_BYTES);
        assert!(MAX_FILE_COUNT > 0);
    };

    #[test]
    fn output_is_sorted_alphabetically() {
        let root = tmp_root();
        write(&root.join("z.ts"), b"export {}");
        write(&root.join("a.ts"), b"export {}");
        write(&root.join("m.ts"), b"export {}");

        let report = discover(&root).expect("discover");
        let paths: Vec<_> = report
            .files
            .iter()
            .map(|f| f.relative_path.as_str())
            .collect();
        assert_eq!(paths, vec!["a.ts", "m.ts", "z.ts"]);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn reports_total_size_bytes() {
        let root = tmp_root();
        write(&root.join("a.ts"), b"1234567890");
        write(&root.join("b.py"), b"12345");

        let report = discover(&root).expect("discover");
        assert_eq!(report.total_size_bytes, 15);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn relative_path_uses_forward_slash_on_windows() {
        let root = tmp_root();
        write(&root.join("src/sub/x.ts"), b"export {}");

        let report = discover(&root).expect("discover");
        assert_eq!(report.files[0].relative_path, "src/sub/x.ts");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn js_jsx_mjs_cjs_all_classify_as_javascript() {
        let root = tmp_root();
        for f in &["a.js", "b.jsx", "c.mjs", "d.cjs"] {
            write(&root.join(f), b"module.exports = {}");
        }
        let report = discover(&root).expect("discover");
        assert_eq!(report.files.len(), 4);
        assert!(report
            .files
            .iter()
            .all(|f| f.language == SourceLanguage::JavaScript));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ts_tsx_mts_cts_all_classify_as_typescript() {
        let root = tmp_root();
        for f in &["a.ts", "b.tsx", "c.mts", "d.cts"] {
            write(&root.join(f), b"export {}");
        }
        let report = discover(&root).expect("discover");
        assert_eq!(report.files.len(), 4);
        assert!(report
            .files
            .iter()
            .all(|f| f.language == SourceLanguage::TypeScript));
        fs::remove_dir_all(&root).ok();
    }
}
