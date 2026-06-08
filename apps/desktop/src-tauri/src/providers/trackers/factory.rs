//! Factory to construct issue tracker clients.

use std::sync::Arc;

use super::{jira::JiraTracker, IssueTracker};

#[must_use]
pub fn build_tracker(
    site_url: &str,
    email: &str,
    api_token: &str,
) -> Arc<dyn IssueTracker> {
    Arc::new(JiraTracker::new(site_url, email, api_token))
}
