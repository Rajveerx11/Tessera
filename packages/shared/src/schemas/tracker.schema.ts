import { z } from 'zod';

export const TrackerConfigViewSchema = z.object({
  id: z.string().uuid(),
  tracker: z.string(),
  siteUrl: z.string(),
  email: z.string(),
  hasApiToken: z.boolean(),
  projectKey: z.string(),
  issueType: z.string(),
  isActive: z.boolean(),
});

export type TrackerConfigView = z.infer<typeof TrackerConfigViewSchema>;

export const ExternalLinkSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  tracker: z.string(),
  itemRef: z.string(),
  issueKey: z.string(),
  issueUrl: z.string(),
  issueType: z.string().nullable().optional(),
  lastStatus: z.string().nullable().optional(),
  statusFetchedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExternalLink = z.infer<typeof ExternalLinkSchema>;

export const PushPreviewSchema = z.object({
  summary: z.string(),
  description: z.string(),
  priority: z.string().nullable().optional(),
  labels: z.array(z.string()),
  projectKey: z.string(),
  issueType: z.string(),
  alreadyLinked: z.boolean(),
});

export type PushPreview = z.infer<typeof PushPreviewSchema>;

export const CreatedIssueSchema = z.object({
  key: z.string(),
  id: z.string(),
  url: z.string(),
});

export type CreatedIssue = z.infer<typeof CreatedIssueSchema>;

export const TrackerUserSchema = z.object({
  displayName: z.string(),
  email: z.string().nullable().optional(),
  accountId: z.string(),
});

export type TrackerUser = z.infer<typeof TrackerUserSchema>;

export const BulkPushResultItemSchema = z.object({
  artifactId: z.string().uuid(),
  success: z.boolean(),
  key: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export type BulkPushResultItem = z.infer<typeof BulkPushResultItemSchema>;
