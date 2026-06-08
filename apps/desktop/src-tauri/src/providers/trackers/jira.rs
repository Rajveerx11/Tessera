//! Jira Cloud issue tracker client implementation.

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::{CreatedIssue, IssueTracker, NewIssue, TrackerError, TrackerUser};

pub struct JiraTracker {
    client: Client,
    site_url: String,
    email: String,
    api_token: String,
}

impl JiraTracker {
    #[must_use]
    pub fn new(site_url: &str, email: &str, api_token: &str) -> Self {
        let site_url = site_url.trim_end_matches('/').to_string();
        let client = Client::builder()
            .user_agent("Tessera-Testing-IDE")
            .build()
            .unwrap_or_default();

        Self {
            client,
            site_url,
            email: email.to_string(),
            api_token: api_token.to_string(),
        }
    }
}

async fn handle_response_error(res: reqwest::Response) -> TrackerError {
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    TrackerError::from_http_status(status, &text)
}

#[derive(Serialize)]
struct CreateIssuePayload {
    fields: IssueFields,
}

#[derive(Serialize)]
struct AddCommentPayload {
    body: String,
}

#[derive(Serialize)]
struct IssueFields {
    project: ProjectKey,
    summary: String,
    description: String,
    issuetype: IssueTypeRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<PriorityRef>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent: Option<ParentRef>,
}

#[derive(Serialize)]
struct ProjectKey {
    key: String,
}

#[derive(Serialize)]
struct IssueTypeRef {
    name: String,
}

#[derive(Serialize)]
struct PriorityRef {
    name: String,
}

#[derive(Serialize)]
struct ParentRef {
    key: String,
}

#[derive(Deserialize)]
struct CreateIssueResponse {
    key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MyselfResponse {
    display_name: String,
    email_address: Option<String>,
}

#[derive(Deserialize)]
struct IssueStatusResponse {
    fields: StatusFields,
}

#[derive(Deserialize)]
struct StatusFields {
    status: StatusInfo,
}

#[derive(Deserialize)]
struct StatusInfo {
    name: String,
}

#[async_trait]
impl IssueTracker for JiraTracker {
    fn name(&self) -> &'static str {
        "jira"
    }

    async fn test_connection(&self) -> Result<TrackerUser, TrackerError> {
        let url = format!("{}/rest/api/2/myself", self.site_url);
        let res = self
            .client
            .get(&url)
            .basic_auth(&self.email, Some(&self.api_token))
            .send()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        if !res.status().is_success() {
            return Err(handle_response_error(res).await);
        }

        let body: MyselfResponse = res
            .json()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        Ok(TrackerUser {
            display_name: body.display_name,
            email_address: body.email_address,
        })
    }

    async fn create_issue(&self, issue: NewIssue) -> Result<CreatedIssue, TrackerError> {
        let url = format!("{}/rest/api/2/issue", self.site_url);

        let mut summary = issue.summary.clone();
        if summary.len() > 255 {
            let mut end = 255;
            while end > 0 && !summary.is_char_boundary(end) {
                end -= 1;
            }
            summary.truncate(end);
        }

        let build_payload = |with_priority: bool| CreateIssuePayload {
            fields: IssueFields {
                project: ProjectKey {
                    key: issue.project_key.clone(),
                },
                summary: summary.clone(),
                description: issue.description.clone(),
                issuetype: IssueTypeRef {
                    name: issue.issue_type.clone(),
                },
                priority: if with_priority {
                    issue.priority.clone().map(|p| PriorityRef { name: p })
                } else {
                    None
                },
                labels: issue.labels.clone(),
                parent: issue.parent_key.clone().map(|k| ParentRef { key: k }),
            },
        };

        let has_priority = issue.priority.is_some();
        let payload = build_payload(has_priority);

        let res = self
            .client
            .post(&url)
            .basic_auth(&self.email, Some(&self.api_token))
            .json(&payload)
            .send()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        let status = res.status();
        if status == reqwest::StatusCode::BAD_REQUEST && has_priority {
            // Retry without priority
            let retry_payload = build_payload(false);
            let retry_res = self
                .client
                .post(&url)
                .basic_auth(&self.email, Some(&self.api_token))
                .json(&retry_payload)
                .send()
                .await
                .map_err(|e| TrackerError::Transport(e.to_string()))?;

            if !retry_res.status().is_success() {
                return Err(handle_response_error(retry_res).await);
            }

            let body: CreateIssueResponse = retry_res
                .json()
                .await
                .map_err(|e| TrackerError::Transport(e.to_string()))?;

            let key = body.key;
            let browse_url = format!("{}/browse/{}", self.site_url, key);
            Ok(CreatedIssue {
                key,
                url: browse_url,
                issue_type: issue.issue_type.clone(),
                status: "To Do".to_string(),
            })
        } else {
            if !status.is_success() {
                return Err(handle_response_error(res).await);
            }

            let body: CreateIssueResponse = res
                .json()
                .await
                .map_err(|e| TrackerError::Transport(e.to_string()))?;

            let key = body.key;
            let browse_url = format!("{}/browse/{}", self.site_url, key);
            Ok(CreatedIssue {
                key,
                url: browse_url,
                issue_type: issue.issue_type.clone(),
                status: "To Do".to_string(),
            })
        }
    }

    async fn get_issue_status(&self, issue_key: &str) -> Result<String, TrackerError> {
        let url = format!(
            "{}/rest/api/2/issue/{}?fields=status",
            self.site_url, issue_key
        );
        let res = self
            .client
            .get(&url)
            .basic_auth(&self.email, Some(&self.api_token))
            .send()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        if !res.status().is_success() {
            return Err(handle_response_error(res).await);
        }

        let body: IssueStatusResponse = res
            .json()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        Ok(body.fields.status.name)
    }

    async fn add_comment(&self, issue_key: &str, body: &str) -> Result<(), TrackerError> {
        let url = format!(
            "{}/rest/api/2/issue/{}/comment",
            self.site_url, issue_key
        );

        let payload = AddCommentPayload {
            body: body.to_string(),
        };

        let res = self
            .client
            .post(&url)
            .basic_auth(&self.email, Some(&self.api_token))
            .json(&payload)
            .send()
            .await
            .map_err(|e| TrackerError::Transport(e.to_string()))?;

        if !res.status().is_success() {
            return Err(handle_response_error(res).await);
        }

        Ok(())
    }
}
