import { z } from 'zod';

import { GenerationArtifactTypeSchema } from './generation.schema';

const IsoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * Artifact lifecycle status — mirrors `ArtifactStatus` in
 * `apps/desktop/src-tauri/src/repositories/artifact_repo.rs` (snake_case
 * over the IPC boundary).
 */
export const ArtifactLifecycleStatusSchema = z.union([
  z.literal('draft'),
  z.literal('in_review'),
  z.literal('approved'),
  z.literal('rejected'),
]);

export type ArtifactLifecycleStatus = z.infer<typeof ArtifactLifecycleStatusSchema>;

/**
 * Lightweight projection used by the review queue (no markdown body).
 * Mirrors `ArtifactSummary` in `commands/artifacts.rs`.
 */
export const ArtifactSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  artifactType: GenerationArtifactTypeSchema,
  title: z.string().min(1),
  status: ArtifactLifecycleStatusSchema,
  version: z.number().int().positive(),
  parentId: z.string().uuid().nullable().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  provider: z.string(),
  model: z.string(),
});

export type ArtifactSummary = z.infer<typeof ArtifactSummarySchema>;

/**
 * Full artifact payload for the detail view. Mirrors `ArtifactDetail`
 * in `commands/artifacts.rs`.
 */
export const ArtifactDetailSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  artifactType: GenerationArtifactTypeSchema,
  title: z.string().min(1),
  contentMd: z.string(),
  structuredData: z.unknown(),
  status: ArtifactLifecycleStatusSchema,
  version: z.number().int().positive(),
  parentId: z.string().uuid().nullable().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export type ArtifactDetail = z.infer<typeof ArtifactDetailSchema>;

/**
 * Version-chain entry — lightweight projection used by the version
 * picker dropdown in the artifact detail drawer. Mirrors
 * `ArtifactVersionSummary` in `commands/artifacts.rs`.
 */
export const ArtifactVersionSummarySchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: ArtifactLifecycleStatusSchema,
  title: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  parentId: z.string().uuid().nullable().optional(),
});

export type ArtifactVersionSummary = z.infer<typeof ArtifactVersionSummarySchema>;
