/**
 * Monaco bundle bootstrap.
 *
 * Imported once by `main.tsx` so `MonacoEnvironment.getWorker` is set
 * before any `<Editor>` mounts. Vite's `?worker` suffix turns each
 * `*.worker.js` file from `monaco-editor` into a bundled web worker the
 * Tauri WebView can load locally — required because the desktop CSP
 * disallows cross-origin scripts.
 */

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type MonacoEnvironmentLike = {
  getWorker?: (workerId: string, label: string) => Worker;
};

const host = globalThis as unknown as { MonacoEnvironment?: MonacoEnvironmentLike };

if (host.MonacoEnvironment === undefined) {
  host.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'json') return new jsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };
}
