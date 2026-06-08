PRAGMA foreign_keys = ON;

CREATE TABLE tracker_configs (
    id                  TEXT PRIMARY KEY NOT NULL,
    user_id             TEXT NOT NULL,
    tracker             TEXT NOT NULL,              -- 'jira'
    site_url            TEXT NOT NULL,              -- https://acme.atlassian.net
    email               TEXT NOT NULL,
    api_token_encrypted BLOB,
    api_token_nonce     BLOB,
    project_key         TEXT NOT NULL,
    issue_type          TEXT NOT NULL DEFAULT 'Task',
    severity_map_json   TEXT,                       -- NULL = default mapping
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (user_id, tracker)
);

CREATE TABLE external_links (
    id                TEXT PRIMARY KEY NOT NULL,
    artifact_id       TEXT NOT NULL,
    tracker           TEXT NOT NULL,                -- 'jira'
    item_ref          TEXT NOT NULL DEFAULT '',     -- '' = whole artifact; case_id for test cases
    issue_key         TEXT NOT NULL,                -- 'PROJ-123'
    issue_url         TEXT NOT NULL,
    issue_type        TEXT,
    last_status       TEXT,
    status_fetched_at TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
    UNIQUE (artifact_id, tracker, item_ref)
);

CREATE INDEX idx_tracker_configs_user_tracker ON tracker_configs(user_id, tracker);
CREATE INDEX idx_external_links_artifact_id ON external_links(artifact_id);
CREATE INDEX idx_external_links_tracker_key ON external_links(tracker, issue_key);
