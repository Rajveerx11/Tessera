//! External-service integrations: LLM providers + embedding providers.
//!
//! Per `rules.md` §5.2 + §12.2: services depend on the `LlmProvider` /
//! `EmbeddingProvider` traits, never concrete implementations. Concrete
//! providers (Ollama, `OpenAI`, Anthropic, `OpenRouter`) are selected by a
//! factory at runtime based on user configuration.
//!
//! Sub-modules:
//!
//! - [`llm`] — chat-style generation (Phase 2). Trait + four concrete
//!   providers + typed errors.
//! - [`embeddings`] — vector embeddings (Phase 2). Trait + Ollama impl.
//! - `factory` — runtime provider selection (added at the end of Phase 2).

pub mod embeddings;
pub mod llm;
