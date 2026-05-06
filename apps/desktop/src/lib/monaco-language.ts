/**
 * Best-effort filename → Monaco language id mapping. Falls back to
 * `plaintext` so the editor still renders rather than throwing.
 *
 * Only languages we actually expect to view in this IDE are wired up.
 * Monaco bundles many more — extend the table when a real user need
 * appears, not preemptively.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'plaintext', // Monaco has no built-in TOML lang; render as text
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  xml: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
};

/** Filenames (lowercased) that imply a specific language regardless of
 *  extension — `Dockerfile`, `Makefile`, etc. */
const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  rakefile: 'ruby',
  gemfile: 'ruby',
};

export function languageFromFilename(filename: string): string {
  const base = (filename.split(/[\\/]/u).pop() ?? '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SPECIAL_FILENAMES, base)) {
    return SPECIAL_FILENAMES[base] ?? 'plaintext';
  }
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return 'plaintext';
  const ext = base.slice(dot + 1);
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}
