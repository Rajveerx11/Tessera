import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

/**
 * Top-level error boundary.
 *
 * `@sentry/react` ships a higher-order ErrorBoundary that catches any
 * uncaught render-time exception in the React tree and forwards it to
 * the configured Sentry DSN (or no-ops when Sentry isn't initialised).
 * We wrap `<App />` with it so a broken component cannot blank out the
 * desktop window — instead the user sees a friendly recovery screen
 * with a reload button, and we still get the stack on the Sentry
 * dashboard.
 *
 * The Tauri runtime panics on the Rust side surface via the native
 * panic hook installed by `sentry::init` (see
 * `apps/desktop/src-tauri/src/utils/telemetry.rs`). This boundary is
 * the renderer-side complement: the two together give us coverage on
 * both halves of the desktop process.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  // Sentry's ErrorBoundary fallback prop types `resetError` as an
  // unbound method, which `@typescript-eslint/unbound-method` rejects
  // when passed by reference. Cast at the boundary to a plain
  // `() => void` so we can hand the callback to `FallbackScreen`
  // without wrapping it on every render.
  type FallbackArgs = { error: unknown; resetError: () => void };
  const renderFallback = (args: FallbackArgs) => (
    <FallbackScreen error={args.error} resetError={args.resetError} />
  );

  return (
    <Sentry.ErrorBoundary fallback={renderFallback} showDialog={false}>
      {children}
    </Sentry.ErrorBoundary>
  );
}

function FallbackScreen({
  error,
  resetError,
}: {
  error: unknown;
  resetError: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  return (
    <div className="relative flex min-h-screen w-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="bg-mosaic" aria-hidden="true" />
      <div className="relative z-10 max-w-lg">
        <img
          src="/tessera-logo.png"
          alt=""
          aria-hidden="true"
          className="mx-auto mb-5 size-16 rounded-xl opacity-90"
          draggable="false"
        />
        <h1 className="text-base font-semibold text-foreground">Something went wrong.</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          The renderer ran into an unexpected error. Your project files and database are
          untouched — the error happens in the UI shell.
        </p>

        <pre className="bg-surface-2 border-border text-destructive mt-4 max-h-48 overflow-auto rounded-md border p-3 text-left font-mono text-[11px] leading-relaxed">
          {message}
        </pre>

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={resetError}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded px-3 text-xs"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 rounded border border-border px-3 text-xs"
          >
            Reload window
          </button>
        </div>

        <p className="text-muted-foreground mt-5 text-[11px]">
          If this keeps happening, report it at{' '}
          <a
            href="https://github.com/Rajveerx11/Tessera/issues/new"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2"
          >
            github.com/Rajveerx11/Tessera/issues
          </a>
          .
        </p>
      </div>
    </div>
  );
}
