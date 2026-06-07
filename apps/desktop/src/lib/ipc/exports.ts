import {
  type ExportFormat,
  type ExportOutcome,
  ExportOutcomeSchema,
} from '@testing-ide/shared';

import { invokeAndParse, invokeString } from './invoke';

/**
 * Export an artifact to a file on disk. The Rust side validates
 * `destPath` and renders the requested format — markdown/JSON
 * straight off `structured_data`, xlsx/csv/tsv through the export
 * IR. Returns every file written (CSV/TSV exports of multi-section
 * artifacts emit siblings; markdown/JSON always write one file).
 */
export async function exportArtifact(
  artifactId: string,
  format: ExportFormat,
  destPath: string,
): Promise<ExportOutcome> {
  return invokeAndParse('export_artifact', ExportOutcomeSchema, {
    artifactId,
    format,
    destPath,
  });
}

/**
 * Render an artifact as clipboard-ready TSV. The TSV is always built
 * Rust-side so the artifact→table mapping logic never duplicates in
 * TypeScript.
 */
export async function getArtifactTsv(artifactId: string): Promise<string> {
  return invokeString('get_artifact_tsv', { artifactId });
}
