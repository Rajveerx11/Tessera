//! Jira push service — handles pushing artifacts and test cases to Jira.

use serde::Serialize;
use sqlx::SqlitePool;

use std::fmt::Write;

use crate::error::AppResult;
use crate::providers::trackers::{IssueTracker, NewIssue};
use crate::repositories::external_link_repo::{self, ExternalLinkRow, ExternalLinkUpsert};
use crate::repositories::tracker_config_repo;
use crate::services::tracker_config_service::build_tracker_client;
use crate::utils::crypto::CryptoKey;

const DEFAULT_USER_ID: &str = "00000000-0000-4000-8000-000000000001";

/// Parse the optional `severity_map_json` config blob into a lookup table.
/// Shape: `{ "p0": "Highest", "p1": "High", ... }`. Malformed JSON is ignored
/// and the built-in default mapping applies.
fn parse_severity_map(raw: Option<&str>) -> std::collections::HashMap<String, String> {
    raw.and_then(|s| serde_json::from_str::<std::collections::HashMap<String, String>>(s).ok())
        .unwrap_or_default()
}

/// Map an artifact case priority (`p0`–`p3`) to a Jira priority name, honoring
/// the user's `severity_map` override before falling back to the default.
fn resolve_jira_priority(
    case_priority: Option<&str>,
    severity_map: &std::collections::HashMap<String, String>,
) -> Option<String> {
    let key = case_priority?;
    if let Some(mapped) = severity_map.get(key) {
        return Some(mapped.clone());
    }
    match key {
        "p0" => Some("High".to_string()),
        "p1" => Some("Medium".to_string()),
        "p2" => Some("Low".to_string()),
        "p3" => Some("Lowest".to_string()),
        other => Some(other.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub keys: Vec<String>,
    pub urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkPushResultItem {
    pub artifact_id: String,
    pub success: bool,
    pub keys: Vec<String>,
    pub error: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct TestCasesStructuredData {
    cases: Vec<TestCaseItem>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct TestCaseItem {
    id: String,
    title: String,
    preconditions: Option<Vec<String>>,
    steps: Vec<String>,
    expected_result: Option<String>,
    priority: Option<String>,
}

/// Create a Jira issue for `(artifact_id, item_ref)` — or, when a link already
/// exists, return the existing key/url instead of creating a duplicate. This
/// makes push idempotent: re-pushing a linked artifact is a per-item no-op
/// rather than orphaning the prior issue with a fresh one.
async fn create_or_get_link(
    pool: &SqlitePool,
    tracker: &dyn IssueTracker,
    artifact_id: &str,
    item_ref: &str,
    new_issue: NewIssue,
) -> AppResult<(String, String)> {
    if let Some(existing) =
        external_link_repo::fetch_for_item(pool, artifact_id, "jira", item_ref).await?
    {
        return Ok((existing.issue_key, existing.issue_url));
    }
    let created = tracker.create_issue(new_issue).await?;
    external_link_repo::upsert(
        pool,
        ExternalLinkUpsert {
            artifact_id: artifact_id.to_string(),
            tracker: "jira".to_string(),
            item_ref: item_ref.to_string(),
            issue_key: created.key.clone(),
            issue_url: created.url.clone(),
            issue_type: Some(created.issue_type),
            last_status: Some(created.status),
        },
    )
    .await?;
    Ok((created.key, created.url))
}

/// Push an artifact to Jira.
pub async fn push_artifact(
    pool: &SqlitePool,
    crypto: &CryptoKey,
    artifact_id: &str,
) -> AppResult<PushResult> {
    let tracker_config = tracker_config_repo::fetch_active(pool, DEFAULT_USER_ID, "jira").await?;
    let tracker = build_tracker_client(crypto, &tracker_config)?;
    let severity_map = parse_severity_map(tracker_config.severity_map_json.as_deref());
    let artifact = crate::repositories::artifact_repo::fetch(pool, artifact_id).await?;

    let mut keys = Vec::new();
    let mut urls = Vec::new();

    match artifact.artifact_type {
        crate::repositories::artifact_repo::ArtifactType::TestPlan => {
            // Push as Epic
            let new_issue = NewIssue {
                project_key: tracker_config.project_key.clone(),
                summary: artifact.title.clone(),
                description: artifact.content_md.clone(),
                issue_type: "Epic".to_string(),
                priority: None,
                labels: vec!["tessera-test-plan".to_string()],
                parent_key: None,
            };

            let (key, url) =
                create_or_get_link(pool, tracker.as_ref(), &artifact.id, "", new_issue).await?;
            keys.push(key);
            urls.push(url);
        }
        crate::repositories::artifact_repo::ArtifactType::TestCases => {
            // Push individual test cases
            let structured: TestCasesStructuredData = serde_json::from_value(artifact.structured_data.clone())?;

            // Check parent Epic
            let mut parent_epic_key: Option<String> = None;
            if let Some(ref parent_id) = artifact.parent_id {
                if let Some(link) = external_link_repo::fetch_for_item(pool, parent_id, "jira", "").await? {
                    parent_epic_key = Some(link.issue_key);
                }
            }

            for case in structured.cases {
                let mut description = String::new();
                if let Some(pre) = &case.preconditions {
                    if !pre.is_empty() {
                        description.push_str("h3. Preconditions\n");
                        for p in pre {
                            let _ = writeln!(description, "* {p}");
                        }
                        description.push('\n');
                    }
                }
                description.push_str("h3. Steps\n");
                for (i, step) in case.steps.iter().enumerate() {
                    let _ = writeln!(description, "{}. {step}", i + 1);
                }
                description.push('\n');
                if let Some(exp) = &case.expected_result {
                    description.push_str("h3. Expected Result\n");
                    description.push_str(exp);
                    description.push('\n');
                }

                // Map priority, honoring the config's severity override.
                let jira_priority = resolve_jira_priority(case.priority.as_deref(), &severity_map);

                let new_issue = NewIssue {
                    project_key: tracker_config.project_key.clone(),
                    summary: case.title.clone(),
                    description,
                    issue_type: tracker_config.issue_type.clone(),
                    priority: jira_priority,
                    labels: vec!["tessera-test-case".to_string()],
                    parent_key: parent_epic_key.clone(),
                };

                let (key, url) =
                    create_or_get_link(pool, tracker.as_ref(), &artifact.id, &case.id, new_issue)
                        .await?;
                keys.push(key);
                urls.push(url);
            }
        }
        _ => {
            // Push other artifacts (e.g. bug_report, defect_report, context_md) as the default issue type
            let new_issue = NewIssue {
                project_key: tracker_config.project_key.clone(),
                summary: artifact.title.clone(),
                description: artifact.content_md.clone(),
                issue_type: tracker_config.issue_type.clone(),
                priority: None,
                labels: vec![format!("tessera-{}", artifact.artifact_type.as_str())],
                parent_key: None,
            };

            let (key, url) =
                create_or_get_link(pool, tracker.as_ref(), &artifact.id, "", new_issue).await?;
            keys.push(key);
            urls.push(url);
        }
    }

    Ok(PushResult { keys, urls })
}

/// Bulk push multiple artifacts to Jira.
pub async fn bulk_push_artifacts(
    pool: &SqlitePool,
    crypto: &CryptoKey,
    artifact_ids: Vec<String>,
) -> AppResult<Vec<BulkPushResultItem>> {
    let mut results = Vec::new();
    for id in artifact_ids {
        match push_artifact(pool, crypto, &id).await {
            Ok(res) => {
                results.push(BulkPushResultItem {
                    artifact_id: id,
                    success: true,
                    keys: res.keys,
                    error: None,
                });
            }
            Err(e) => {
                results.push(BulkPushResultItem {
                    artifact_id: id,
                    success: false,
                    keys: vec![],
                    error: Some(e.to_string()),
                });
            }
        }
    }
    Ok(results)
}

/// Refresh the status of a linked Jira issue and return the updated link row
/// so the UI can patch its artifact→link map without a second round-trip.
pub async fn refresh_link_status(
    pool: &SqlitePool,
    crypto: &CryptoKey,
    link_id: &str,
) -> AppResult<ExternalLinkRow> {
    let link = external_link_repo::fetch(pool, link_id).await?;
    let tracker_config = tracker_config_repo::fetch_active(pool, DEFAULT_USER_ID, &link.tracker).await?;
    let tracker = build_tracker_client(crypto, &tracker_config)?;
    let status = tracker
        .get_issue_status(&link.issue_key)
        .await?;
    external_link_repo::update_status(pool, link_id, &status).await?;
    external_link_repo::fetch(pool, link_id).await
}

/// Post sandbox run results as a comment on any linked issues for this artifact.
pub async fn post_run_comment(
    pool: &SqlitePool,
    crypto: &CryptoKey,
    artifact_id: &str,
    status: &str,
    passed_count: u32,
    failed_count: u32,
) -> AppResult<()> {
    let config_opt = tracker_config_repo::fetch_for_user_tracker(pool, DEFAULT_USER_ID, "jira").await?;
    let tracker_config = match config_opt {
        Some(c) if c.is_active => c,
        _ => return Ok(()),
    };

    let tracker = build_tracker_client(crypto, &tracker_config)?;

    let links = external_link_repo::list_for_artifact(pool, artifact_id).await?;
    if links.is_empty() {
        return Ok(());
    }

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let total = passed_count + failed_count;
    let body = if total == 0 {
        // Runner errored/cancelled before any test executed — a "0/0 passed"
        // fraction reads as a broken denominator, so omit it entirely.
        format!("Automated run {}: {}", date, status.to_uppercase())
    } else {
        format!(
            "Automated run {}: {} — {}/{} passed",
            date,
            status.to_uppercase(),
            passed_count,
            total
        )
    };

    for link in links {
        let _ = tracker.add_comment(&link.issue_key, &body).await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_severity_map, resolve_jira_priority};

    #[test]
    fn severity_override_beats_default() {
        let map = parse_severity_map(Some(r#"{"p0":"Highest","p1":"High"}"#));
        assert_eq!(resolve_jira_priority(Some("p0"), &map).as_deref(), Some("Highest"));
        assert_eq!(resolve_jira_priority(Some("p1"), &map).as_deref(), Some("High"));
    }

    #[test]
    fn falls_back_to_default_mapping() {
        let map = parse_severity_map(None);
        assert_eq!(resolve_jira_priority(Some("p2"), &map).as_deref(), Some("Low"));
        assert_eq!(resolve_jira_priority(Some("custom"), &map).as_deref(), Some("custom"));
        assert_eq!(resolve_jira_priority(None, &map), None);
    }

    #[test]
    fn malformed_severity_json_is_ignored() {
        let map = parse_severity_map(Some("not json"));
        assert!(map.is_empty());
        assert_eq!(resolve_jira_priority(Some("p3"), &map).as_deref(), Some("Lowest"));
    }
}

