//! Embedding provider abstraction.
//!
//! Per ADR-0003, the embedding interface is parallel to `LlmProvider`
//! rather than fused: one model emits tokens, the other emits vectors.
//! Splitting keeps each trait minimal and avoids degenerate methods on
//! providers that only do one of the two jobs.
//!
//! Phase 2 ships [`OllamaEmbeddingProvider`] (local, free, default).
//! Cloud providers (Voyage AI, `OpenAI` `text-embedding-3-*`) follow
//! at the same shape in later phases.

use async_trait::async_trait;

use super::llm::error::LlmError;

pub mod ollama;

pub use ollama::OllamaEmbeddingProvider;

/// Provider-agnostic embedding interface. Implementations expose the
/// dimension and model identifier so downstream consumers (chunk
/// repository per ADR-0001) can persist the metadata alongside each
/// vector and refuse cross-provider comparisons.
#[async_trait]
pub trait EmbeddingProvider: Send + Sync {
    /// Stable provider identifier (lowercase snake-case).
    fn name(&self) -> &'static str;

    /// Vector dimension produced by this provider/model combination.
    /// Used by `chunk_repo` to scope vector searches per-dimension
    /// (ADR-0001 "search WHERE clause must filter by ... `embedding_dim`").
    fn dimension(&self) -> usize;

    /// Concrete model identifier (e.g. `nomic-embed-text`,
    /// `text-embedding-3-small`). Stored on every chunk so a future
    /// model upgrade can be detected and trigger re-embedding.
    fn model_id(&self) -> &str;

    /// Embed a batch of input strings. Output ordering matches input.
    ///
    /// # Errors
    ///
    /// Returns [`LlmError`] for transport, auth, rate-limit, or
    /// schema failures. Reuses the `LlmError` type since embedding
    /// providers are typically the same vendors as chat providers
    /// and surface the same failure modes.
    async fn embed(&self, inputs: Vec<String>) -> Result<Vec<Vec<f32>>, LlmError>;
}
