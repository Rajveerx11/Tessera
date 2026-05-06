import {
  type ArtifactDetail,
  ArtifactDetailSchema,
  type ArtifactSummary,
  ArtifactSummarySchema,
} from '@testing-ide/shared';
import { z } from 'zod';

import { invokeAndParse, invokeVoid } from './invoke';

const ArtifactSummaryListSchema = z.array(ArtifactSummarySchema);

export async function listArtifacts(projectId: string): Promise<ArtifactSummary[]> {
  return invokeAndParse('list_artifacts', ArtifactSummaryListSchema, { projectId });
}

export async function getArtifact(id: string): Promise<ArtifactDetail> {
  return invokeAndParse('get_artifact', ArtifactDetailSchema, { id });
}

export async function approveArtifact(id: string): Promise<void> {
  return invokeVoid('approve_artifact', { id });
}

export async function rejectArtifact(id: string): Promise<void> {
  return invokeVoid('reject_artifact', { id });
}
