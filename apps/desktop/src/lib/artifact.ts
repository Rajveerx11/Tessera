import type { ArtifactDetail, ArtifactSummary } from '@testing-ide/shared';

/**
 * Project a full {@link ArtifactDetail} down to the lightweight
 * {@link ArtifactSummary} used by the review queue.
 *
 * `ArtifactSummary` is a strict field-subset of `ArtifactDetail`, so this
 * is a pure projection. Centralizing it here means a schema change to the
 * summary shape updates one mapping instead of every caller that upserts a
 * freshly-fetched detail into the store.
 */
export function toArtifactSummary(detail: ArtifactDetail): ArtifactSummary {
  return {
    id: detail.id,
    projectId: detail.projectId,
    artifactType: detail.artifactType,
    title: detail.title,
    status: detail.status,
    version: detail.version,
    parentId: detail.parentId ?? null,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    provider: detail.provider,
    model: detail.model,
  };
}
