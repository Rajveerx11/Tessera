//! Shared building blocks for `OpenAI`-compatible providers.
//!
//! Three providers in Phase 2 share the same wire format: Ollama (no
//! auth), `OpenAI` (Bearer auth on `api.openai.com`), and `OpenRouter`
//! (Bearer auth on `openrouter.ai`, plus optional analytics headers).
//! Rather than three near-identical SSE parsers, this module exposes:
//!
//! - [`build_request_payload`] — construct the JSON body sent to
//!   `/v1/chat/completions`.
//! - [`stream_chat_completions`] — issue the POST, parse the SSE
//!   response into `Chunk`s, and emit them through a boxed stream.
//! - [`map_http_error`] — uniform HTTP-status → `LlmError` mapping.
//!
//! Concrete providers (ollama, openai, openrouter) become thin wrappers
//! that supply config (URL, headers, provider name) and forward to
//! these helpers.

use async_stream::try_stream;
use futures::stream::StreamExt;
use reqwest::header::HeaderMap;
use reqwest::Client;
use serde::Deserialize;

use super::error::LlmError;
use super::types::{Chunk, FinishReason, GenerateRequest, Message, Role, ToolSchema, Usage};
use super::ChunkStream;

/// Configuration handed to [`stream_chat_completions`] by each
/// concrete provider. `extra_headers` covers things like `OpenRouter`'s
/// `HTTP-Referer` / `X-Title`.
pub struct ChatRequest<'a> {
    pub provider: &'static str,
    pub endpoint: &'a str,
    pub headers: HeaderMap,
    pub body: serde_json::Value,
    pub client: &'a Client,
}

/// Issue the POST and yield `Chunk`s as they arrive. Error responses
/// are translated via [`map_http_error`] and surfaced as the first
/// (and only) item on the stream.
#[must_use]
pub fn stream_chat_completions(req: ChatRequest<'_>) -> ChunkStream {
    let provider = req.provider;
    let endpoint = req.endpoint.to_string();
    let headers = req.headers;
    let mut body = req.body.clone();
    let client = req.client.clone();

    let s = try_stream! {
        let mut response = client
            .post(&endpoint)
            .headers(headers.clone())
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::from_reqwest(provider, &e))?;

        let mut status = response.status();

        // Check if the request failed and contains tool specifications that we can strip.
        if !status.is_success() && body.get("tools").is_some() {
            let headers_in = response.headers().clone();
            let text = response.text().await.unwrap_or_default();
            let text_lower = text.to_lowercase();

            // If the error suggests that the model or endpoint doesn't support tools/functions
            if text_lower.contains("tool")
                || text_lower.contains("function")
                || text_lower.contains("tool_choice")
                || text_lower.contains("tool choice")
                || text_lower.contains("endpoints found")
            {
                tracing::warn!(
                    provider = %provider,
                    "Model failed with tool error: {}. Retrying without tool use.",
                    text
                );

                // Strip tools and tool_choice; without a tool schema to
                // constrain output, force JSON via response_format instead.
                if let serde_json::Value::Object(ref mut obj) = body {
                    obj.remove("tools");
                    obj.remove("tool_choice");
                    obj.insert(
                        "response_format".to_string(),
                        serde_json::json!({ "type": "json_object" }),
                    );
                }

                // Retry request
                response = client
                    .post(&endpoint)
                    .headers(headers.clone())
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| LlmError::from_reqwest(provider, &e))?;
                status = response.status();
            } else {
                // If it wasn't a tool error, propagate the original error
                Err(map_http_error(provider, status, &headers_in, &text))?;
                // Unreachable: `Err(...)?` propagates above.
                unreachable!("yielded error above")
            }
        }

        let headers_in = response.headers().clone();
        let body_stream = if status.is_success() {
            response.bytes_stream()
        } else {
            let text = response.text().await.unwrap_or_default();
            Err(map_http_error(provider, status, &headers_in, &text))?;
            unreachable!("yielded error above")
        };

        let mut byte_stream = body_stream;
        let mut buffer = String::new();

        while let Some(bytes) = byte_stream.next().await {
            let bytes = bytes.map_err(|e| LlmError::StreamInterrupted {
                provider,
                message: e.to_string(),
            })?;

            let text = std::str::from_utf8(&bytes).map_err(|e| LlmError::StreamInterrupted {
                provider,
                message: format!("non-utf8 stream bytes: {e}"),
            })?;
            buffer.push_str(text);

            while let Some((event, rest)) = split_sse_event(&buffer) {
                let event_owned = event.to_string();
                buffer = rest.to_string();
                for chunk in parse_sse_event(provider, &event_owned)? {
                    yield chunk;
                }
            }
        }

        // The connection closed. Some servers omit the trailing `\n\n`
        // on the last event, leaving a complete-but-unterminated payload
        // in the buffer. Parse it so callers do not silently lose the
        // final delta or `[DONE]` sentinel.
        let trailing = buffer.trim();
        if !trailing.is_empty() {
            for chunk in parse_sse_event(provider, trailing)? {
                yield chunk;
            }
        }
    };

    Box::pin(s)
}

/// Build the JSON body sent to `/v1/chat/completions`.
#[must_use]
pub fn build_request_payload(req: &GenerateRequest, stream: bool) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "model": req.model,
        "messages": req.messages.iter().map(message_to_openai).collect::<Vec<_>>(),
        "stream": stream,
    });

    if req.tools.is_empty() {
        // No tool schema to constrain output — force JSON via response_format.
        payload["response_format"] = serde_json::json!({ "type": "json_object" });
    } else {
        // Tool schema already constrains output to JSON. Sending
        // response_format alongside a forced tool_choice is rejected by
        // Gemini's OpenAI-compat endpoint (400 INVALID_ARGUMENT: forced
        // function calling with a JSON response mime type is unsupported).
        payload["tools"] = req.tools.iter().map(tool_to_openai).collect();
        if req.tools.len() == 1 {
            payload["tool_choice"] = tool_choice_to_openai(&req.tools[0]);
        }
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

fn tool_choice_to_openai(tool: &ToolSchema) -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": tool.name,
        }
    })
}

/// Pull the human-readable `error.message` out of a JSON error body
/// (`{"error":{"message":"..."}}` — the envelope Ollama and every
/// OpenAI-compatible server emit). Returns `None` when the body is not
/// JSON or the field is missing/empty, so callers fall back to the raw
/// body preview.
fn extract_api_error_message(body: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let message = value.get("error")?.get("message")?.as_str()?;
    if message.is_empty() {
        None
    } else {
        Some(message.to_string())
    }
}

/// Map a non-2xx HTTP response to the closest [`LlmError`] variant.
/// Reads the `Retry-After` response header on 429 responses.
#[must_use]
pub fn map_http_error(
    provider: &'static str,
    status: reqwest::StatusCode,
    headers: &HeaderMap,
    body: &str,
) -> LlmError {
    let preview: String = match extract_api_error_message(body) {
        Some(message) => message.chars().take(256).collect(),
        None => body.chars().take(256).collect(),
    };
    match status.as_u16() {
        401 | 403 => LlmError::AuthFailed {
            provider,
            message: preview,
        },
        429 => LlmError::RateLimited {
            provider,
            retry_after_seconds: headers
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok()),
        },
        400 => LlmError::InvalidResponse {
            provider,
            message: format!("bad request: {preview}"),
        },
        500..=599 => {
            // Ollama reports an out-of-memory model load as a bare 500.
            // Surface an actionable hint instead of the raw API envelope.
            let message = if preview.contains("requires more system memory") {
                format!(
                    "{preview}. Close other applications to free up RAM, \
                     or switch to a smaller model (e.g. qwen2.5-coder:1.5b) in Settings."
                )
            } else {
                format!("HTTP {status}: {preview}")
            };
            LlmError::ProviderUnavailable { provider, message }
        }
        _ => LlmError::InvalidResponse {
            provider,
            message: format!("HTTP {status}: {preview}"),
        },
    }
}

/// Split off the first complete SSE event (terminated by `\n\n` or
/// `\r\n\r\n`) from `buffer`. Returns `(event, rest)` if found.
fn split_sse_event(buffer: &str) -> Option<(&str, &str)> {
    if let Some(idx) = buffer.find("\n\n") {
        let (event, rest) = buffer.split_at(idx);
        Some((event, &rest[2..]))
    } else if let Some(idx) = buffer.find("\r\n\r\n") {
        let (event, rest) = buffer.split_at(idx);
        Some((event, &rest[4..]))
    } else {
        None
    }
}

/// Parse one complete SSE event into zero or more `Chunk`s.
fn parse_sse_event(provider: &'static str, event: &str) -> Result<Vec<Chunk>, LlmError> {
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
            out.push(Chunk::Done {
                usage: Usage::default(),
                finish_reason: FinishReason::Stop,
            });
            continue;
        }
        let parsed: OpenAiStreamChunk =
            serde_json::from_str(payload).map_err(|e| LlmError::InvalidResponse {
                provider,
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

#[derive(Debug, Deserialize)]
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
    use mockito::Server;

    fn empty_request() -> GenerateRequest {
        GenerateRequest {
            model: "x".into(),
            messages: vec![Message::user("hi")],
            tools: Vec::new(),
            temperature: None,
            max_tokens: None,
            stop_sequences: Vec::new(),
        }
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
        let chunks = parse_sse_event("test", "data: [DONE]").expect("parse");
        assert_eq!(chunks.len(), 1);
        assert!(matches!(chunks[0], Chunk::Done { .. }));
    }

    #[test]
    fn parse_text_delta_chunk() {
        let payload = r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#;
        let chunks = parse_sse_event("test", payload).expect("parse");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], Chunk::TextDelta("hello".into()));
    }

    #[test]
    fn parse_finish_reason_emits_done_with_usage() {
        let payload = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}"#;
        let chunks = parse_sse_event("test", payload).expect("parse");
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
        let err = parse_sse_event("test", "data: {not json").expect_err("must fail");
        assert_eq!(err.code(), "LLM_INVALID_RESPONSE");
        assert_eq!(err.provider(), "test");
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
    fn build_request_payload_sets_required_fields() {
        let body = build_request_payload(&empty_request(), true);
        assert_eq!(body["model"], "x");
        assert_eq!(body["stream"], true);
        assert!(body["messages"].is_array());
        assert_eq!(body["response_format"]["type"], "json_object");
    }

    #[test]
    fn build_request_payload_forces_single_tool_choice() {
        let mut request = empty_request();
        request.tools = vec![ToolSchema {
            name: "emit_test_plan".into(),
            description: "Emit a test plan.".into(),
            parameters_schema: serde_json::json!({ "type": "object" }),
        }];

        let body = build_request_payload(&request, true);

        assert_eq!(body["tools"][0]["function"]["name"], "emit_test_plan");
        assert_eq!(body["tool_choice"]["type"], "function");
        assert_eq!(body["tool_choice"]["function"]["name"], "emit_test_plan");
        // Gemini rejects response_format combined with forced tool_choice.
        assert!(body.get("response_format").is_none());
    }

    #[test]
    fn build_request_payload_omits_empty_optionals() {
        let body = build_request_payload(&empty_request(), false);
        assert!(body.get("tools").is_none());
        assert!(body.get("tool_choice").is_none());
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
        let h = HeaderMap::new();
        assert_eq!(
            map_http_error("p", reqwest::StatusCode::UNAUTHORIZED, &h, "x").code(),
            "LLM_AUTH_FAILED"
        );
        assert_eq!(
            map_http_error("p", reqwest::StatusCode::TOO_MANY_REQUESTS, &h, "x").code(),
            "LLM_RATE_LIMITED"
        );
        assert_eq!(
            map_http_error("p", reqwest::StatusCode::BAD_REQUEST, &h, "x").code(),
            "LLM_INVALID_RESPONSE"
        );
        assert_eq!(
            map_http_error("p", reqwest::StatusCode::INTERNAL_SERVER_ERROR, &h, "x").code(),
            "LLM_PROVIDER_UNAVAILABLE"
        );
    }

    #[test]
    fn map_http_error_extracts_json_error_message() {
        let h = HeaderMap::new();
        let body = r#"{"error":{"message":"model not found","type":"api_error"}}"#;
        let err = map_http_error("ollama", reqwest::StatusCode::NOT_FOUND, &h, body);
        let display = err.to_string();
        assert!(display.contains("model not found"));
        assert!(
            !display.contains("api_error"),
            "raw JSON envelope must not leak into the message: {display}"
        );
    }

    #[test]
    fn map_http_error_adds_hint_on_ollama_oom() {
        let h = HeaderMap::new();
        let body = r#"{"error":{"message":"model requires more system memory (6.7 GiB) than is available (6.0 GiB)","type":"api_error","param":null,"code":null}}"#;
        let err = map_http_error(
            "ollama",
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            &h,
            body,
        );
        assert_eq!(err.code(), "LLM_PROVIDER_UNAVAILABLE");
        let display = err.to_string();
        assert!(display.contains("6.7 GiB"));
        assert!(display.contains("smaller model"));
        assert!(display.contains("qwen2.5-coder:1.5b"));
    }

    #[test]
    fn map_http_error_falls_back_to_raw_body_when_not_json() {
        let h = HeaderMap::new();
        let err = map_http_error(
            "p",
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            &h,
            "plain text failure",
        );
        assert!(err.to_string().contains("plain text failure"));
    }

    #[test]
    fn map_http_error_reads_retry_after_header() {
        let mut h = HeaderMap::new();
        h.insert("retry-after", "42".parse().expect("header"));
        let err = map_http_error("p", reqwest::StatusCode::TOO_MANY_REQUESTS, &h, "");
        match err {
            LlmError::RateLimited {
                retry_after_seconds: Some(secs),
                ..
            } => assert_eq!(secs, 42),
            other => panic!("expected RateLimited with retry_after, got {other:?}"),
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_tool_fallback_on_unsupported_model() {
        let mut server = Server::new_async().await;

        // Mock 1: Tool-based request fails with a 404 No endpoints found that support tool use.
        let mock_fail = server
            .mock("POST", "/v1/chat/completions")
            .with_status(404)
            .with_body(r#"{"error":{"message":"No endpoints found that support tool use. Try disabling \"emit_project_context\"","code":404}}"#)
            .create_async()
            .await;

        // Mock 2: Retried request without tools succeeds.
        let mock_success = server
            .mock("POST", "/v1/chat/completions")
            .match_body(mockito::Matcher::PartialJson(serde_json::json!({
                "model": "google/gemma-2-9b-it",
                "stream": true,
                "response_format": { "type": "json_object" }
            })))
            .with_status(200)
            .with_body("data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"summary\\\": \\\"salvaged json\\\"}\"}}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
            .create_async()
            .await;

        let mut req = empty_request();
        req.model = "google/gemma-2-9b-it".into();
        req.tools = vec![ToolSchema {
            name: "emit_project_context".into(),
            description: "Emit project context.".into(),
            parameters_schema: serde_json::json!({ "type": "object" }),
        }];

        let headers = HeaderMap::new();
        let body = build_request_payload(&req, true);
        let client = Client::new();

        let mut stream = stream_chat_completions(ChatRequest {
            provider: "test-fallback",
            endpoint: &format!("{}/v1/chat/completions", server.url()),
            headers,
            body,
            client: &client,
        });

        let mut text = String::new();
        while let Some(chunk) = stream.next().await {
            if let Chunk::TextDelta(t) = chunk.expect("chunk") {
                text.push_str(&t);
            }
        }

        assert_eq!(text, "{\"summary\": \"salvaged json\"}");
        mock_fail.assert_async().await;
        mock_success.assert_async().await;
    }
}
