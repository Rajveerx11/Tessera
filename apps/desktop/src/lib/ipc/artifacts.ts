import {
  type ArtifactDetail,
  ArtifactDetailSchema,
  type ArtifactSummary,
  ArtifactSummarySchema,
  type ArtifactVersionSummary,
  ArtifactVersionSummarySchema,
} from '@testing-ide/shared';
import { z } from 'zod';

import { invokeAndParse, invokeVoid } from './invoke';

const ArtifactSummaryListSchema = z.array(ArtifactSummarySchema);
const ArtifactVersionListSchema = z.array(ArtifactVersionSummarySchema);

export async function listArtifacts(projectId: string): Promise<ArtifactSummary[]> {
  return invokeAndParse('list_artifacts', ArtifactSummaryListSchema, { projectId });
}

export async function getArtifact(id: string): Promise<ArtifactDetail> {
  return invokeAndParse('get_artifact', ArtifactDetailSchema, { id });
}

/**
 * Fetch the full version chain (ancestors + self + descendants) for
 * `id`, sorted by version ascending. Used by the artifact detail
 * drawer's version picker + diff view.
 */
export async function listArtifactVersions(
  id: string,
): Promise<ArtifactVersionSummary[]> {
  return invokeAndParse('list_artifact_versions', ArtifactVersionListSchema, { id });
}

export async function approveArtifact(id: string): Promise<void> {
  return invokeVoid('approve_artifact', { id });
}

export async function rejectArtifact(id: string): Promise<void> {
  return invokeVoid('reject_artifact', { id });
}
