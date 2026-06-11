---
name: run-app
description: Launch the Tessera desktop app (Tauri 2 dev mode) on Windows so it can be tested/driven. Use when asked to "open", "run", "start", or "test" the app, or to confirm a change works in the real window. Encodes the Windows-specific launch that avoids the pnpm path-mangling failure.
---

# Run the Tessera desktop app (dev)

## Launch — do exactly this

Bypass pnpm. Invoke the Tauri wrapper with `node` directly:

```bash
cd "C:/Testing IDE/apps/desktop" && node ./scripts/run-tauri-with-rust-path.mjs dev
```

Run it with `run_in_background: true` — the first Rust compile is a cold
build and takes a few minutes. The wrapper (`run-tauri-with-rust-path.mjs`)
prepends `%USERPROFILE%\.cargo\bin` to PATH and then calls the bundled
`@tauri-apps/cli`, so cargo is found even if the terminal started without it.

## What success looks like (watch the background log)

1. `VITE vX ready` → `Local: http://localhost:5173/`  (frontend up)
2. `Running DevCommand (cargo run ...)`               (Rust compile starts)
3. `Finished \`dev\` profile` then the **app window opens**

Use Monitor on the output file, grepping for `Finished \`dev\``, `error[`,
`error:`, `cannot find`, `panicked` so you catch both success and failure.

## Do NOT use

```bash
# FAILS on this machine — git-bash mangles the spawned script path
# ('un-tauri-with-rust-path.mjs' is not recognized ...)
pnpm --filter @testing-ide/desktop run dev
```

## Why pnpm fails here

The repo path `C:\Testing IDE` contains a **space**. When pnpm's recursive
runner (`--filter ... run dev`) spawns the package's `dev` script through a
Windows shell under git-bash, the spaced path gets mis-tokenized and the
leading characters of the command are dropped, so the shell tries to execute
`un-tauri-with-rust-path.mjs` and bails. Calling `node` on the wrapper
ourselves skips pnpm's spawn layer entirely, so nothing gets mangled.

Permanent alternatives (not required): rename the repo folder to remove the
space (e.g. `C:\TessIDE`), or run the same `node` command from PowerShell.
