import { spawn, type SpawnOptions } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Per rules.md §12.3: reuse constants from the shared package to avoid duplication.
import { REQUIRED_MODELS } from '../../packages/shared/src/schemas/ollama-status.schema.ts';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 3_000;

type RequiredModel = (typeof REQUIRED_MODELS)[number] | string;

function writeInfo(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBaseUrl(): string {
  const rawBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  return normalizeOllamaBaseUrl(rawBaseUrl);
}

function normalizeOllamaBaseUrl(raw: string): string {
  let current = raw.trim().replace(/\/+$/, '');

  while (current.endsWith('/api') || current.endsWith('/v1')) {
    if (current.endsWith('/api')) {
      current = current.slice(0, -'/api'.length).replace(/\/+$/, '');
      continue;
    }

    current = current.slice(0, -'/v1'.length).replace(/\/+$/, '');
  }

  return current;
}

function buildOllamaUrl(baseUrl: string, path: string): URL {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl);
}

async function fetchJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function isOllamaInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const child = spawn('ollama', ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        resolve(false);
        return;
      }
      reject(error);
    });

    child.once('close', () => {
      resolve(true);
    });
  });
}

async function isOllamaRunning(baseUrl: string): Promise<boolean> {
  try {
    await fetchJson(buildOllamaUrl(baseUrl, '/api/version'));
    return true;
  } catch {
    return false;
  }
}

async function listInstalledModels(baseUrl: string): Promise<string[]> {
  const payload = await fetchJson(buildOllamaUrl(baseUrl, '/api/tags'));
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new Error('Ollama /api/tags returned an unexpected payload');
  }

  const models: string[] = [];
  for (const entry of payload.models) {
    if (isRecord(entry) && typeof entry.name === 'string') {
      models.push(entry.name);
    }
  }
  return models;
}

function findMissingModels(
  installedModels: readonly string[],
  required: readonly RequiredModel[],
): RequiredModel[] {
  return required.filter(
    (requiredModel) =>
      !installedModels.some((installedModel) => installedModel.startsWith(requiredModel)),
  );
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function startOllamaDaemon(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function waitForOllama(baseUrl: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isOllamaRunning(baseUrl)) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS);
    });
  }

  throw new Error(`Ollama did not become ready at ${baseUrl} within ${STARTUP_TIMEOUT_MS} ms`);
}

async function pullMissingModels(missingModels: readonly RequiredModel[]): Promise<void> {
  for (const model of missingModels) {
    writeInfo(`Pulling ${model}...`);
    await runCommand('ollama', ['pull', model]);
  }
}

function isMainModule(): boolean {
  const entryFile = process.argv[1];
  if (typeof entryFile !== 'string' || entryFile.length === 0) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entryFile)).href;
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const extraModels = process.argv.slice(2);
  const allRequired = [...new Set([...REQUIRED_MODELS, ...extraModels])];

  writeInfo(`Checking Ollama at ${baseUrl}`);

  if (!(await isOllamaInstalled())) {
    throw new Error(
      'Ollama was not found in PATH. Install Ollama first, then run this script again.',
    );
  }

  const wasRunning = await isOllamaRunning(baseUrl);
  if (!wasRunning) {
    writeInfo('Ollama is installed but not running. Starting the local daemon...');
    await startOllamaDaemon();
    await waitForOllama(baseUrl);
  } else {
    writeInfo('Ollama daemon is already running.');
  }

  const installedModels = await listInstalledModels(baseUrl);
  const missingModels = findMissingModels(installedModels, allRequired);

  if (missingModels.length === 0) {
    writeInfo('Required Ollama models are already installed.');
    return;
  }

  writeInfo(`Missing models: ${missingModels.join(', ')}`);
  await pullMissingModels(missingModels);

  const finalModels = await listInstalledModels(baseUrl);
  const finalMissingModels = findMissingModels(finalModels, allRequired);
  if (finalMissingModels.length > 0) {
    throw new Error(`Bootstrap completed with missing models: ${finalMissingModels.join(', ')}`);
  }

  writeInfo('Ollama bootstrap completed successfully.');
}

if (isMainModule()) {
  void main().catch((error: unknown) => {
    writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
