//! Ollama LLM provider — local `OpenAI`-compatible chat completions.
//!
//! Talks to `${OLLAMA_BASE_URL}/v1/chat/completions`. No authentication
//! header required (Ollama runs locally, single-user). Streaming uses
//! the standard `OpenAI` SSE format (`data: {json}\n\n`, terminated by
//! `data: [DONE]\n\n`).
//!
//! Per ADR-0003, Ollama's wire format is the canonical one — `OpenAI`
//! and `OpenRouter` providers reuse the same SSE parser in subsequent
//! commits.

use std::time::Duration;

use async_trait::async_trait;
use futures::stream::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::error::LlmError;
use super::types::{
    Chunk, FinishReason, GenerateRequest, Message, ProviderCapabilities, Role, ToolSchema, Usage,
};
use super::{ChunkStream, LlmProvider};

/// Provider name used in `LlmError::provider` and logs.
pub const PROVIDER_NAME: &str = "ollama";

/// Conservative defaults; users override per request.
const DEFAULT_TIMEOUT_SECONDS: u64 = 120;

/// Ollama provider. Holds an HTTP client and the resolved base URL.
#[derive(Debug, Clone)]
pub struct OllamaProvider {
    base_url: String,
    client: Client,
    capabilities: ProviderCapabilities,
}

impl OllamaProvider {
    /// Construct a provider pointed at `base_url` (e.g.
    /// `http://localhost:11434`). Trailing slash optional.
    ///
    /// # Errors
    ///
    /// Returns `LlmError::ProviderUnavailable` if the underlying HTTP
    /// client cannot be built (rare — only happens if the platform
    /// rejects rustls or system clocks are absurd).
    pub fn new(base_url: impl Into<String>) -> Result<Self, LlmError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|e| LlmError::ProviderUnavailable {
                provider: PROVIDER_NAME,
                message: format!("failed to build HTTP client: {e}"),
            })?;

        Ok(Self {
            base_url: normalize_base_url(&base_url.into()),
            client,
            // Ollama supports tool calls on most modern models (Qwen2.5,
            // Llama 3.1+, etc.). Capabilities are advisory; if a specific
            // model rejects tools, the request will surface
            // LlmError::Unsupported via Chunk::Done with finish reason.
            capabilities: ProviderCapabilities {
                supports_tools: true,
                supports_streaming: true,
                // Conservative: Qwen2.5 Coder runs at 32K by default.
                // Larger context windows are available per-model.
                max_context_tokens: 32_768,
                max_output_tokens: 8_192,
            },
        })
    }

    fn endpoint(&self) -> String {
        format!("{}/v1/chat/completions", self.base_url)
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn name(&self) -> &'static str {
        PROVIDER_NAME
    }

    fn capabilities(&self) -> &ProviderCapabilities {
        &self.capabilities
    }

    fn count_tokens(&self, text: &str) -> usize {
        super::approximate_token_count(text)
    }

    fn stream(&self, request: GenerateRequest) -> ChunkStream {
        let body = build_openai_request(&request, true);
        let url = self.endpoint();
        let client = self.client.clone();

        let response_stream = async_stream::try_stream! {
            let response = client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| LlmError::from_reqwest(PROVIDER_NAME, &e))?;

            let status = response.status();
            let body_stream = if status.is_success() {
                response.bytes_stream()
            } else {
                let text = response.text().await.unwrap_or_default();
                Err(map_http_error(status, &text))?;
                // Unreachable: `Err(...)?` yields the error and stops the
                // stream. The compiler cannot see this, so feed it a value
                // it accepts.
                unreachable!("yielded error above")
            };

            let mut byte_stream = body_stream;
            let mut buffer = String::new();

            while let Some(bytes) = byte_stream.next().await {
                let bytes = bytes.map_err(|e| LlmError::StreamInterrupted {
                    provider: PROVIDER_NAME,
                    message: e.to_string(),
                })?;

                let text = std::str::from_utf8(&bytes).map_err(|e| LlmError::StreamInterrupted {
                    provider: PROVIDER_NAME,
                    message: format!("non-utf8 stream bytes: {e}"),
                })?;
                buffer.push_str(text);

                while let Some((event, rest)) = split_sse_event(&buffer) {
                    let event_owned = event.to_string();
                    buffer = rest.to_string();
                    for chunk in parse_sse_event(&event_owned)? {
                        yield chunk;
                    }
                }
            }
        };

        Box::pin(response_stream)
    }
}

/// Strip a trailing `/` from `base_url` so endpoint construction never
/// produces double slashes.
fn normalize_base_url(raw: &str) -> String {
    raw.trim_end_matches('/').to_string()
}

/// Build the JSON body sent to `/v1/chat/completions`.
fn build_openai_request(req: &GenerateRequest, stream: bool) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "model": req.model,
        "messages": req.messages.iter().map(message_to_openai).collect::<Vec<_>>(),
        "stream": stream,
    });

    if !req.tools.is_empty() {
        payload["tools"] = req.tools.iter().map(tool_to_openai).collect();
    }
    if let Some(t) = req.temperature {
        payload["temperature"] = serde_json::json!(t);
    }
    if let Some(m) = req.max_tokens {
        payload["max_tokens"] = serde_json::json!(m);
    }
    if !req.stop_sequences.is_empty() {
        payload["stop"] = serde_json::json!(req.stop_sequences);
    }
    payload
}

fn message_to_openai(msg: &Message) -> serde_json::Value {
    let role = match msg.role {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => "tool",
    };
    // Concatenate text blocks; tool blocks are encoded separately for
    // OpenAI-style tool_use / tool_result on the assistant / tool roles.
    let text: String = msg
        .content
        .iter()
        .filter_map(|c| match c {
            super::types::Content::Text { text } => Some(text.as_str()),
            super::types::Content::ToolResult { content, .. } => Some(content.as_str()),
            super::types::Content::ToolUse { .. } => None,
        })
        .collect::<Vec<_>>()
        .join("");
    serde_json::json!({ "role": role, "content": text })
}

fn tool_to_openai(tool: &ToolSchema) -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters_schema,
        }
    })
}

/// Map a non-2xx HTTP response to the closest `LlmError` variant.
fn map_http_error(status: reqwest::StatusCode, body: &str) -> LlmError {
    let preview = body.chars().take(256).collect::<String>();
    match status.as_u16() {
        401 | 403 => LlmError::AuthFailed {
            provider: PROVIDER_NAME,
            message: preview,
        },
        429 => LlmError::RateLimited {
            provider: PROVIDER_NAME,
            retry_after_seconds: None,
        },
        400 => LlmError::InvalidResponse {
            provider: PROVIDER_NAME,
            message: format!("bad request: {preview}"),
        },
        500..=599 => LlmError::ProviderUnavailable {
            provider: PROVIDER_NAME,
            message: format!("HTTP {status}: {preview}"),
        },
        _ => LlmError::InvalidResponse {
            provider: PROVIDER_NAME,
            message: format!("HTTP {status}: {preview}"),
        },
    }
}

/// Split off the first complete SSE event (`...\n\n`) from `buffer`.
/// Returns `(event, rest)` if found, `None` if the buffer does not yet
/// contain a full event.
fn split_sse_event(buffer: &str) -> Option<(&str, &str)> {
    if let Some(idx) = buffer.find("\n\n") {
        let (event, rest) = buffer.split_at(idx);
        // Skip the trailing `\n\n`.
        Some((event, &rest[2..]))
    } else if let Some(idx) = buffer.find("\r\n\r\n") {
        let (event, rest) = buffer.split_at(idx);
        Some((event, &rest[4..]))
    } else {
        None
    }
}

/// Parse one complete SSE event into zero or more `Chunk`s. SSE events
/// are usually a single `data: {...}` line; comments and `event:` lines
/// are ignored.
fn parse_sse_event(event: &str) -> Result<Vec<Chunk>, LlmError> {
    let mut out = Vec::new();
    for line in event.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        let Some(payload) = line.strip_prefix("data:") else {
            continue;
        };
        let payload = payload.trim();
        if payload == "[DONE]" {
            // Ollama ends with `data: [DONE]`. The previous chunk should
            // already have carried finish_reason; emit a synthetic Done
            // only if we haven't yet seen one.
            out.push(Chunk::Done {
                usage: Usage::default(),
                finish_reason: FinishReason::Stop,
            });
            continue;
        }
        let parsed: OpenAiStreamChunk =
            serde_json::from_str(payload).map_err(|e| LlmError::InvalidResponse {
                provider: PROVIDER_NAME,
                message: format!("invalid stream JSON: {e}"),
            })?;
        for chunk in openai_chunk_to_chunks(parsed) {
            out.push(chunk);
        }
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
struct OpenAiStreamChunk {
    #[serde(default)]
    choices: Vec<OpenAiStreamChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiStreamChoice {
    #[serde(default)]
    delta: OpenAiDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<OpenAiToolCall>,
}

#[derive(Debug, Deserialize)]
struct OpenAiToolCall {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    index: u32,
    #[serde(default)]
    function: Option<OpenAiToolFunction>,
}

#[derive(Debug, Deserialize)]
struct OpenAiToolFunction {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct OpenAiUsage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
}

fn openai_chunk_to_chunks(chunk: OpenAiStreamChunk) -> Vec<Chunk> {
    let mut out = Vec::new();
    for choice in chunk.choices {
        if let Some(text) = choice.delta.content {
            if !text.is_empty() {
                out.push(Chunk::TextDelta(text));
            }
        }
        for call in choice.delta.tool_calls {
            let id = call
                .id
                .clone()
                .unwrap_or_else(|| format!("tool_{}", call.index));
            if let Some(function) = call.function {
                if let Some(name) = function.name {
                    out.push(Chunk::ToolCallStart {
                        id: id.clone(),
                        name,
                    });
                }
                if let Some(args) = function.arguments {
                    if !args.is_empty() {
                        out.push(Chunk::ToolCallArgsDelta {
                            id,
                            json_fragment: args,
                        });
                    }
                }
            }
        }
        if let Some(reason) = choice.finish_reason {
            let usage = chunk.usage.as_ref().map_or(Usage::default(), |u| Usage {
                input_tokens: u.prompt_tokens,
                output_tokens: u.completion_tokens,
            });
            out.push(Chunk::Done {
                usage,
                finish_reason: parse_finish_reason(&reason),
            });
        }
    }
    out
}

fn parse_finish_reason(raw: &str) -> FinishReason {
    match raw {
        "stop" => FinishReason::Stop,
        "length" => FinishReason::MaxTokens,
        "tool_calls" | "function_call" => FinishReason::ToolUse,
        "content_filter" => FinishReason::ContentFilter,
        _ => FinishReason::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::llm::types::Content;
    use futures::StreamExt;
    use mockito::Server;

    fn sample_request(model: &str) -> GenerateRequest {
        GenerateRequest {
            model: model.into(),
            messages: vec![Message::user("hi")],
            tools: Vec::new(),
            temperature: None,
            max_tokens: None,
            stop_sequences: Vec::new(),
        }
    }

    #[test]
    fn normalize_base_url_strips_trailing_slash() {
        assert_eq!(normalize_base_url("http://x:11434/"), "http://x:11434");
        assert_eq!(normalize_base_url("http://x:11434"), "http://x:11434");
    }

    #[test]
    fn split_sse_event_handles_lf() {
        let buf = "data: a\n\ndata: b\n\nleftover";
        let (event, rest) = split_sse_event(buf).expect("first event");
        assert_eq!(event, "data: a");
        assert!(rest.starts_with("data: b"));
    }

    #[test]
    fn split_sse_event_handles_crlf() {
        let buf = "data: a\r\n\r\nrest";
        let (event, rest) = split_sse_event(buf).expect("event");
        assert_eq!(event, "data: a");
        assert_eq!(rest, "rest");
    }

    #[test]
    fn split_sse_event_returns_none_when_incomplete() {
        assert!(split_sse_event("data: incomplete").is_none());
    }

    #[test]
    fn parse_done_sentinel_emits_done_chunk() {
        let chunks = parse_sse_event("data: [DONE]").expect("parse");
        assert_eq!(chunks.len(), 1);
        assert!(matches!(chunks[0], Chunk::Done { .. }));
    }

    #[test]
    fn parse_text_delta_chunk() {
        let payload = r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#;
        let chunks = parse_sse_event(payload).expect("parse");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], Chunk::TextDelta("hello".into()));
    }

    #[test]
    fn parse_finish_reason_emits_done() {
        let payload = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}"#;
        let chunks = parse_sse_event(payload).expect("parse");
        assert_eq!(chunks.len(), 1);
        match &chunks[0] {
            Chunk::Done {
                usage,
                finish_reason,
            } => {
                assert_eq!(usage.input_tokens, 10);
                assert_eq!(usage.output_tokens, 5);
                assert_eq!(*finish_reason, FinishReason::Stop);
            }
            other => panic!("expected Done, got {other:?}"),
        }
    }

    #[test]
    fn parse_invalid_json_returns_invalid_response_error() {
        let payload = "data: {not json";
        let err = parse_sse_event(payload).expect_err("must fail");
        assert_eq!(err.code(), "LLM_INVALID_RESPONSE");
    }

    #[test]
    fn parse_finish_reason_maps_known_values() {
        assert_eq!(parse_finish_reason("stop"), FinishReason::Stop);
        assert_eq!(parse_finish_reason("length"), FinishReason::MaxTokens);
        assert_eq!(parse_finish_reason("tool_calls"), FinishReason::ToolUse);
        assert_eq!(
            parse_finish_reason("content_filter"),
            FinishReason::ContentFilter
        );
        assert_eq!(parse_finish_reason("unexpected"), FinishReason::Other);
    }

    #[test]
    fn build_openai_request_includes_required_fields() {
        let req = sample_request("qwen2.5-coder:7b");
        let body = build_openai_request(&req, true);
        assert_eq!(body["model"], "qwen2.5-coder:7b");
        assert_eq!(body["stream"], true);
        assert!(body["messages"].is_array());
    }

    #[test]
    fn build_openai_request_omits_empty_optionals() {
        let req = sample_request("m");
        let body = build_openai_request(&req, false);
        assert!(body.get("tools").is_none());
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("stop").is_none());
    }

    #[test]
    fn message_to_openai_concats_text_blocks() {
        let msg = Message {
            role: Role::User,
            content: vec![Content::text("hello "), Content::text("world")],
        };
        let json = message_to_openai(&msg);
        assert_eq!(json["role"], "user");
        assert_eq!(json["content"], "hello world");
    }

    #[test]
    fn map_http_error_routes_status_codes() {
        assert_eq!(
            map_http_error(reqwest::StatusCode::UNAUTHORIZED, "x").code(),
            "LLM_AUTH_FAILED"
        );
        assert_eq!(
            map_http_error(reqwest::StatusCode::TOO_MANY_REQUESTS, "x").code(),
            "LLM_RATE_LIMITED"
        );
        assert_eq!(
            map_http_error(reqwest::StatusCode::BAD_REQUEST, "x").code(),
            "LLM_INVALID_RESPONSE"
        );
        assert_eq!(
            map_http_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR, "x").code(),
            "LLM_PROVIDER_UNAVAILABLE"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stream_emits_text_then_done_against_mock() {
        let mut server = Server::new_async().await;
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n\
                    data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n\
                    data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n\
                    data: [DONE]\n\n";
        let mock = server
            .mock("POST", "/v1/chat/completions")
            .with_status(200)
            .with_header("content-type", "text/event-stream")
            .with_body(body)
            .create_async()
            .await;

        let provider = OllamaProvider::new(server.url()).expect("provider");
        let mut stream = provider.stream(sample_request("qwen2.5-coder:7b"));
        let mut texts = Vec::new();
        let mut done_seen = false;

        while let Some(chunk) = stream.next().await {
            match chunk.expect("chunk") {
                Chunk::TextDelta(t) => texts.push(t),
                Chunk::Done { .. } => done_seen = true,
                _ => {}
            }
        }

        assert_eq!(texts, vec!["hello".to_string(), " world".to_string()]);
        assert!(done_seen, "must observe Done chunk");
        mock.assert_async().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stream_yields_auth_failed_on_401() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/v1/chat/completions")
            .with_status(401)
            .with_body("unauthorized")
            .create_async()
            .await;

        let provider = OllamaProvider::new(server.url()).expect("provider");
        let mut stream = provider.stream(sample_request("m"));
        let first = stream.next().await.expect("at least one yield");
        let err = first.expect_err("expect error item");
        assert_eq!(err.code(), "LLM_AUTH_FAILED");
        mock.assert_async().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stream_yields_rate_limited_on_429() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/v1/chat/completions")
            .with_status(429)
            .with_body("slow down")
            .create_async()
            .await;

        let provider = OllamaProvider::new(server.url()).expect("provider");
        let mut stream = provider.stream(sample_request("m"));
        let first = stream.next().await.expect("yield");
        let err = first.expect_err("error");
        assert_eq!(err.code(), "LLM_RATE_LIMITED");
        mock.assert_async().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn generate_drains_stream_into_response() {
        let mut server = Server::new_async().await;
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n\
                    data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n";
        let mock = server
            .mock("POST", "/v1/chat/completions")
            .with_status(200)
            .with_body(body)
            .create_async()
            .await;

        let provider = OllamaProvider::new(server.url()).expect("provider");
        let response = provider
            .generate(sample_request("m"))
            .await
            .expect("generate");
        assert_eq!(response.usage.input_tokens, 1);
        assert_eq!(response.usage.output_tokens, 1);
        assert_eq!(response.finish_reason, FinishReason::Stop);
        let text = response
            .content
            .iter()
            .filter_map(|c| match c {
                Content::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");
        assert_eq!(text, "hi");
        mock.assert_async().await;
    }
}
