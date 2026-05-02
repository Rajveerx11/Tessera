//! Wire-agnostic request/response types for the `LlmProvider` trait.
//!
//! Per ADR-0003: `Content` is wide enough to carry both `OpenAI` flat
//! strings and Anthropic content blocks; concrete providers translate at
//! the wire boundary so service code never branches on provider identity.

use serde::{Deserialize, Serialize};

/// Conversation role assigned to a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// System / instruction prompt.
    System,
    /// User input.
    User,
    /// Model output.
    Assistant,
    /// Tool-call result returned to the model.
    Tool,
}

/// Single chunk of message content. Text is the common case; tool
/// variants exist so Anthropic's content-block model and `OpenAI`'s flat
/// string model share one shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Content {
    /// Plain text content.
    Text { text: String },
    /// Model-emitted tool call. `args` is JSON encoded as a string so
    /// streaming providers can append fragments before the JSON closes.
    ToolUse {
        id: String,
        name: String,
        args: String,
    },
    /// Tool execution result fed back to the model.
    ToolResult { id: String, content: String },
}

impl Content {
    /// Create a plain-text content block.
    #[must_use]
    pub fn text(s: impl Into<String>) -> Self {
        Self::Text { text: s.into() }
    }
}

/// One conversation turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: Vec<Content>,
}

impl Message {
    /// System message with a single text block.
    #[must_use]
    pub fn system(text: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: vec![Content::text(text)],
        }
    }

    /// User message with a single text block.
    #[must_use]
    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: vec![Content::text(text)],
        }
    }

    /// Assistant message with a single text block.
    #[must_use]
    pub fn assistant(text: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: vec![Content::text(text)],
        }
    }
}

/// Tool definition advertised to the model. `parameters_schema` is a
/// JSON Schema document describing the call signature, used for
/// structured output validation per `rules.md` §12.1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    pub parameters_schema: serde_json::Value,
}

/// Generation request submitted to a provider. Optional fields are left
/// for the provider to default — Ollama sets temperature 0.8 by default,
/// `OpenAI` 1.0, Anthropic 1.0; honoring those defaults is acceptable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<ToolSchema>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stop_sequences: Vec<String>,
}

/// Token-counting summary returned in the final stream chunk and on the
/// non-streaming response.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl Usage {
    /// Total tokens charged for this request.
    #[must_use]
    pub fn total(&self) -> u32 {
        self.input_tokens.saturating_add(self.output_tokens)
    }
}

/// Aggregated response from a non-streaming `generate` call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResponse {
    pub content: Vec<Content>,
    pub usage: Usage,
    pub finish_reason: FinishReason,
}

/// Why generation stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    /// Model emitted its end-of-turn token.
    Stop,
    /// Hit `max_tokens` before completing.
    MaxTokens,
    /// Model invoked one or more tools and is awaiting their results.
    ToolUse,
    /// Hit one of the configured stop sequences.
    StopSequence,
    /// Provider terminated for content-policy reasons.
    ContentFilter,
    /// Provider returned a finish reason we do not yet model.
    Other,
}

/// One increment of streamed output. Concrete providers translate their
/// SSE events into this enum; service code consumes a single uniform
/// stream regardless of provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Chunk {
    /// New text appended to the assistant turn.
    TextDelta(String),
    /// A new tool call started; `id` and `name` are stable for the rest
    /// of the call.
    ToolCallStart { id: String, name: String },
    /// JSON fragment appended to the tool call's `args`. Concatenation of
    /// every fragment in order yields a complete JSON document.
    ToolCallArgsDelta { id: String, json_fragment: String },
    /// Final chunk. No further chunks follow on the stream.
    Done {
        usage: Usage,
        finish_reason: FinishReason,
    },
}

/// Provider-level capability flags. Services use these to fail fast
/// rather than discover at request time that a model lacks a needed
/// feature.
#[derive(Debug, Clone, Copy)]
pub struct ProviderCapabilities {
    /// Provider supports JSON-Schema tool calling.
    pub supports_tools: bool,
    /// Provider supports incremental streaming via SSE / chunked transfer.
    pub supports_streaming: bool,
    /// Maximum input context window in tokens.
    pub max_context_tokens: u32,
    /// Maximum tokens the provider will emit in one response.
    pub max_output_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_helpers_set_role() {
        assert_eq!(Message::system("s").role, Role::System);
        assert_eq!(Message::user("u").role, Role::User);
        assert_eq!(Message::assistant("a").role, Role::Assistant);
    }

    #[test]
    fn message_helpers_carry_text() {
        let m = Message::user("hello");
        assert_eq!(m.content.len(), 1);
        assert_eq!(m.content[0], Content::text("hello"));
    }

    #[test]
    fn usage_total_is_sum_of_components() {
        let u = Usage {
            input_tokens: 100,
            output_tokens: 250,
        };
        assert_eq!(u.total(), 350);
    }

    #[test]
    fn usage_total_saturates_on_overflow() {
        let u = Usage {
            input_tokens: u32::MAX,
            output_tokens: 1,
        };
        assert_eq!(u.total(), u32::MAX);
    }

    #[test]
    fn role_serializes_lowercase() {
        let json = serde_json::to_string(&Role::User).expect("serialize");
        assert_eq!(json, "\"user\"");
    }

    #[test]
    fn content_round_trips_through_json() {
        let original = Content::ToolUse {
            id: "tool_1".into(),
            name: "lookup".into(),
            args: r#"{"q":"x"}"#.into(),
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let back: Content = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original, back);
    }
}
