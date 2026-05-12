/**
 * Browser-preview splash.
 *
 * Tessera is a Tauri desktop application — every IPC call routes
 * through the native Tauri runtime, so the React shell cannot work
 * standalone in a browser tab. This screen replaces the blank page
 * with a clear "open the desktop app" message when a user (often
 * during local dev) opens `localhost:5173` directly instead of
 * launching via `tauri dev`.
 *
 * Rendered only by `main.tsx` after it confirms `window.__TAURI_*`
 * globals are missing.
 */
export function BrowserNotice() {
  return (
    <div className="relative flex min-h-screen w-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="bg-mosaic" aria-hidden="true" />
      <div className="relative z-10 max-w-md">
        <img
          src="/tessera-logo.png"
          alt=""
          aria-hidden="true"
          className="mx-auto mb-5 size-20 rounded-xl opacity-90"
          draggable="false"
        />
        <h1 className="font-brand text-primary text-2xl">tessera</h1>
        <p className="text-muted-foreground mt-1 text-xs font-semibold uppercase tracking-[0.16em]">
          Desktop application
        </p>

        <h2 className="mt-6 text-base font-semibold text-foreground">
          Open Tessera from the desktop app
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          You opened the Vite dev server in a regular browser tab. Tessera runs as a native
          Tauri window so it can index local code, talk to your local Ollama server, and store
          API keys encrypted on disk — none of that works inside a sandboxed browser.
        </p>

        <div className="mt-6 rounded-md border border-border bg-card p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            How to launch
          </p>
          <pre className="bg-surface-2 text-foreground mt-2 overflow-x-auto rounded p-3 font-mono text-[11px] leading-relaxed">
            <code>
              cd apps/desktop{'\n'}
              pnpm run dev
            </code>
          </pre>
          <p className="text-muted-foreground mt-2 text-xs">
            That command compiles the Rust backend, boots Vite, and opens the native window.
          </p>
        </div>

        <p className="text-muted-foreground mt-6 text-[11px]">
          Looking for source / docs? Visit{' '}
          <a
            href="https://github.com/Rajveerx11/Tessera"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2"
          >
            github.com/Rajveerx11/Tessera
          </a>
          .
        </p>
      </div>
    </div>
  );
}
