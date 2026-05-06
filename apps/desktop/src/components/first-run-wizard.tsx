import type { HardwareInfo, HealthStatus, OllamaStatus } from '@testing-ide/shared';
import { useCallback, useEffect, useState } from 'react';

import { OllamaSetupModal } from '@/components/ollama-setup-modal';
import { Button } from '@/components/ui/button';
import { type OllamaSetupState, deriveOllamaSetupState } from '@/lib/ollama-setup';
import { hardware, health, IpcError, ollama } from '@/lib/ipc';
import { markOnboardingComplete } from '@/lib/onboarding';

type Props = {
  /** Called once the user dismisses the wizard. Parent should re-render. */
  onComplete: () => void;
};

/**
 * One-screen onboarding flow shown the first time the desktop app launches.
 *
 * Probes OS / DB health and system hardware (RAM + GPU) to recommend a local
 * model tier. It also checks the local Ollama runtime and prompts the user
 * to run the bootstrap script when the required models are missing.
 */
export function FirstRunWizard({ onComplete }: Props) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaCheckAttempt, setOllamaCheckAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void health
      .healthCheck()
      .then((status) => {
        if (!cancelled) {
          setHealthStatus(status);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setHealthError(error instanceof IpcError ? error.message : String(error));
      });

    void hardware
      .detectHardware()
      .then((info) => {
        if (!cancelled) {
          setHardwareInfo(info);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setHardwareError(error instanceof IpcError ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOllamaError(null);
    setOllamaStatus(null);

    void ollama
      .checkOllamaStatus()
      .then((status) => {
        if (!cancelled) {
          setOllamaStatus(status);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setOllamaError(error instanceof IpcError ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [ollamaCheckAttempt]);

  const handleComplete = useCallback(() => {
    markOnboardingComplete();
    onComplete();
  }, [onComplete]);

  const handleRetryOllama = useCallback(() => {
    setOllamaCheckAttempt((attempt) => attempt + 1);
  }, []);

  const recommendedModel = hardwareInfo?.recommendedModel ?? 'qwen2.5-coder:7b';
  const setupState: OllamaSetupState | null = ollamaStatus
    ? deriveOllamaSetupState(ollamaStatus, [recommendedModel])
    : null;
  const isOllamaChecking = ollamaStatus === null && ollamaError === null;
  const showOllamaSetupModal = setupState?.needsSetup ?? false;

  return (
    <>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Testing IDE</h1>
          <p className="text-muted-foreground text-sm">
            Local-first, AI-assisted test artifact generation. We&apos;ll detect your hardware,
            recommend a model, and verify the local Ollama runtime.
          </p>
        </header>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">System detection</h2>
          {healthError || hardwareError ? (
            <p className="text-destructive text-sm" role="alert">
              {healthError || hardwareError}
            </p>
          ) : healthStatus === null || hardwareInfo === null ? (
            <p className="text-muted-foreground text-sm">Probing local hardware...</p>
          ) : (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">OS</dt>
              <dd>
                {healthStatus.osName} {healthStatus.osVersion}
              </dd>
              <dt className="text-muted-foreground">CPUs</dt>
              <dd>{healthStatus.cpuCount}</dd>
              <dt className="text-muted-foreground">Memory</dt>
              <dd>{hardwareInfo.ramGb} GB total</dd>
              {hardwareInfo.gpuName && (
                <>
                  <dt className="text-muted-foreground">GPU</dt>
                  <dd>
                    {hardwareInfo.gpuName} ({hardwareInfo.gpuVramGb} GB VRAM)
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Database</dt>
              <dd>{healthStatus.dbOk ? 'reachable' : 'unreachable'}</dd>
            </dl>
          )}
        </section>

        {hardwareInfo ? (
          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Recommended model</h2>
            <p className="text-sm">
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {hardwareInfo.recommendedModel}
              </code>
            </p>
            <p className="text-muted-foreground text-xs">
              Based on your {hardwareInfo.ramGb} GB RAM
              {hardwareInfo.gpuVramGb ? ` and ${hardwareInfo.gpuVramGb} GB VRAM` : ''}.
            </p>
          </section>
        ) : null}

        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Local AI runtime</h2>
            <Button type="button" size="sm" variant="outline" onClick={handleRetryOllama}>
              Re-check
            </Button>
          </div>
          {ollamaError ? (
            <p className="text-destructive text-sm" role="alert">
              {ollamaError}
            </p>
          ) : isOllamaChecking ? (
            <p className="text-muted-foreground text-sm">Checking Ollama status...</p>
          ) : setupState ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Installed</dt>
              <dd>{setupState.installed ? 'yes' : 'no'}</dd>
              <dt className="text-muted-foreground">Running</dt>
              <dd>{setupState.running ? 'yes' : 'no'}</dd>
              <dt className="text-muted-foreground">Models</dt>
              <dd>{ollamaStatus?.models.length ?? 0}</dd>
            </dl>
          ) : null}
        </section>

        <footer className="flex justify-end">
          <Button
            type="button"
            onClick={handleComplete}
            disabled={hardwareInfo === null && hardwareError === null}
          >
            Get started
          </Button>
        </footer>
      </div>

      {showOllamaSetupModal ? (
        <OllamaSetupModal
          error={ollamaError}
          isChecking={isOllamaChecking}
          recommendedModel={recommendedModel}
          setupState={setupState}
          onRetry={handleRetryOllama}
          onSkip={handleComplete}
        />
      ) : null}
    </>
  );
}
