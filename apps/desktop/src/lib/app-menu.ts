import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect } from 'react';

import { dispatchCommand, isCommandId } from './command-bus';

/**
 * Bridge from the native menu bar to the renderer's command bus.
 *
 * `apps/desktop/src-tauri/src/menu.rs` emits an `app:menu` Tauri
 * event with the clicked item's stable id as the payload. This hook
 * subscribes once at app mount and re-fires the payload through
 * `dispatchCommand` so individual components (Toolbar, Settings
 * sheet, AI panel) can listen for just the commands they own.
 *
 * Mount-once semantics: the listener is installed on the first call
 * and detached on cleanup. Multiple components calling this hook is
 * safe — each installs its own listener — but the App shell is
 * intended to be the only caller in practice.
 */
export function useAppMenuEvents(): void {
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void listen<string>('app:menu', (event) => {
      const id = event.payload;
      if (isCommandId(id)) {
        dispatchCommand(id);
      }
      // Unknown ids are swallowed silently; rules.md §"No console.log
      // in frontend" forbids browser logging. A future logger IPC
      // should forward these to the Rust-side tracing subscriber so a
      // renaming mismatch between menu.rs and command-bus.ts still
      // surfaces during development.
    })
      .then((u) => {
        if (cancelled) {
          u();
        } else {
          unlisten = u;
        }
      })
      .catch(() => {
        // Listener install failure leaves the menu wired but inert;
        // see comment above re: future logger IPC. We swallow rather
        // than throw so React's effect cleanup still runs.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
