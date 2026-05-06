import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';
// Side-effect import — wires Monaco's web-worker URLs before any
// `<Editor>` mounts. See `lib/monaco-setup.ts`.
import './lib/monaco-setup';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
