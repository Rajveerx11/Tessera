import {
  type TrackerConfigView,
  TrackerConfigViewSchema,
  type ExternalLink,
  ExternalLinkSchema,
  type PushPreview,
  PushPreviewSchema,
  type CreatedIssue,
  CreatedIssueSchema,
  type TrackerUser,
  TrackerUserSchema,
  type BulkPushResultItem,
  BulkPushResultItemSchema,
} from '@testing-ide/shared';
import { z } from 'zod';

import { invokeAndParse, invokeVoid } from './invoke';

export type SaveTrackerConfigArgs = {
  tracker: string;
  siteUrl: string;
  email: string;
  apiToken?: string | undefined;
  projectKey: string;
  issueType: string;
  isActive: boolean;
};

export type TestTrackerConnectionArgs = {
  tracker: string;
  siteUrl: string;
  email: string;
  apiToken?: string | undefined;
};

export async function saveTrackerConfig(args: SaveTrackerConfigArgs): Promise<TrackerConfigView> {
  return invokeAndParse('save_tracker_config', TrackerConfigViewSchema, { args });
}

export async function getTrackerConfig(tracker: string = 'jira'): Promise<TrackerConfigView | null> {
  return invokeAndParse('get_tracker_config', TrackerConfigViewSchema.nullable(), { tracker });
}

export async function deleteTrackerConfig(tracker: string = 'jira'): Promise<void> {
  return invokeVoid('delete_tracker_config', { tracker });
}

export async function testTrackerConnection(args: TestTrackerConnectionArgs): Promise<TrackerUser> {
  return invokeAndParse('test_tracker_connection', TrackerUserSchema, { args });
}

export async function previewJiraPush(artifactId: string): Promise<PushPreview> {
  return invokeAndParse('preview_jira_push', PushPreviewSchema, { artifactId });
}

export async function pushArtifactToJira(artifactId: string): Promise<CreatedIssue> {
  return invokeAndParse('push_artifact_to_jira', CreatedIssueSchema, { artifactId });
}

export async function bulkPushArtifactsToJira(artifactIds: string[]): Promise<BulkPushResultItem[]> {
  return invokeAndParse('bulk_push_artifacts_to_jira', z.array(BulkPushResultItemSchema), { artifactIds });
}

export async function refreshExternalLinkStatus(linkId: string): Promise<ExternalLink> {
  return invokeAndParse('refresh_external_link_status', ExternalLinkSchema, { linkId });
}

export async function listExternalLinks(artifactId?: string): Promise<ExternalLink[]> {
  return invokeAndParse('list_external_links', z.array(ExternalLinkSchema), { artifactId });
}
