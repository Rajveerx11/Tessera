import { save } from '@tauri-apps/plugin-dialog';
import type { ExportFormat, ExportOutcome } from '@testing-ide/shared';

import { IpcError, asMessage } from './ipc/error';
import { exportArtifact as exportArtifactIpc } from './ipc/exports';

/**
 * Slug an artifact title into a stable filename with the given
 * extension. Every export format shares this one slug rule.
 */
export function buildExportFilename(title: string, extension: string): string {
  const trimmed = title.trim();
  const normalized = trimmed.length > 0 ? trimmed : 'artifact';
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);

  return `${slug.length > 0 ? slug : 'artifact'}.${extension}`;
}

const FORMAT_DIALOG: Record<ExportFormat, { title: string; filterName: string }> = {
  md: { title: 'Export markdown', filterName: 'Markdown' },
  json: { title: 'Export JSON', filterName: 'JSON' },
  xlsx: { title: 'Export Excel workbook', filterName: 'Excel Workbook' },
  csv: { title: 'Export CSV', filterName: 'CSV' },
  tsv: { title: 'Export TSV', filterName: 'TSV' },
};

/**
 * Full export flow for an artifact: ask the user for a destination
 * via the save dialog, then let the Rust export service render +
 * write the file(s) — markdown/JSON straight off `structured_data`,
 * xlsx/csv/tsv through the tabular IR. Returns `null` when the user
 * cancels the dialog, otherwise the list of files written.
 */
export async function exportArtifactToFile(
  artifactId: string,
  title: string,
  format: ExportFormat,
): Promise<ExportOutcome | null> {
  const dialog = FORMAT_DIALOG[format];

  let selectedPath: string | null;
  try {
    selectedPath = await save({
      title: dialog.title,
      defaultPath: buildExportFilename(title, format),
      filters: [{ name: dialog.filterName, extensions: [format] }],
    });
  } catch (error) {
    throw new IpcError('dialog.save', asMessage(error), { cause: error });
  }

  if (selectedPath === null) {
    return null;
  }

  return exportArtifactIpc(artifactId, format, selectedPath);
}
