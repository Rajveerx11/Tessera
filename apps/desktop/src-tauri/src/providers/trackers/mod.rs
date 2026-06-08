//! Trait and types for external issue trackers.

pub mod error;
pub mod factory;
pub mod jira;

pub use error::TrackerError;

#[derive(Debug, Clone)]
pub struct NewIssue {
    pub project_key: String,
    pub summary: String,
    pub description: String,
    pub issue_type: String,
    pub priority: Option<String>,
    pub labels: Vec<String>,
    pub parent_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreatedIssue {
    pub key: String,
    pub url: String,
    pub issue_type: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct TrackerUser {
    pub display_name: String,
    pub email_address: Option<String>,
}

#[async_trait::async_trait]
pub trait IssueTracker: Send + Sync {
    fn name(&self) -> &'static str;
    async fn test_connection(&self) -> Result<TrackerUser, TrackerError>;
    async fn create_issue(&self, issue: NewIssue) -> Result<CreatedIssue, TrackerError>;
    async fn get_issue_status(&self, issue_key: &str) -> Result<String, TrackerError>;
    async fn add_comment(&self, issue_key: &str, body: &str) -> Result<(), TrackerError>;
}
