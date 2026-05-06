//! Shared base-URL normalization helpers for provider endpoints.
//!
//! Several layers need to accept user-configured provider base URLs while
//! remaining tolerant of common copy/paste variants such as trailing `/v1`
//! or `/api`. These helpers keep that normalization consistent across
//! provider construction, health checks, and connection tests.

/// Normalize an Ollama host URL down to the host/root path.
///
/// Accepted user inputs often include OpenAI-compatible (`/v1`) or native
/// Ollama (`/api`) suffixes. This helper strips either suffix repeatedly so
/// values like `http://localhost:11434/api/v1/` converge to
/// `http://localhost:11434`.
#[must_use]
pub fn normalize_ollama_base_url(raw: &str) -> String {
    strip_known_suffixes(raw, &["/api", "/v1"])
}

/// Normalize an OpenAI-compatible base URL to the API root.
///
/// This strips a trailing `/v1` while preserving any provider-specific path
/// prefix (for example an enterprise proxy mounted at `/openai`).
#[must_use]
pub fn normalize_openai_compatible_base_url(raw: &str) -> String {
    strip_known_suffixes(raw, &["/v1"])
}

fn strip_known_suffixes(raw: &str, suffixes: &[&str]) -> String {
    let mut current = raw.trim().trim_end_matches('/').to_string();

    loop {
        let mut stripped = false;
        for suffix in suffixes {
            if let Some(next) = current.strip_suffix(suffix) {
                current = next.trim_end_matches('/').to_string();
                stripped = true;
                break;
            }
        }

        if !stripped {
            break;
        }
    }

    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_ollama_base_url_strips_api_and_v1_suffixes() {
        assert_eq!(
            normalize_ollama_base_url("http://localhost:11434/"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_ollama_base_url("http://localhost:11434/api/"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_ollama_base_url("http://localhost:11434/v1/"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_ollama_base_url("https://ollama.com/api/v1/"),
            "https://ollama.com"
        );
    }

    #[test]
    fn normalize_openai_compatible_base_url_strips_only_v1() {
        assert_eq!(
            normalize_openai_compatible_base_url("https://api.openai.com/v1/"),
            "https://api.openai.com"
        );
        assert_eq!(
            normalize_openai_compatible_base_url("https://proxy.example.com/openai/v1/"),
            "https://proxy.example.com/openai"
        );
        assert_eq!(
            normalize_openai_compatible_base_url("https://proxy.example.com/openai"),
            "https://proxy.example.com/openai"
        );
    }
}
