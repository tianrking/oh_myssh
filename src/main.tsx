import { Buffer } from 'buffer';
// @microsoft/dev-tunnels-ssh expects Buffer in the browser
const browserGlobals = globalThis as unknown as {
  Buffer: typeof Buffer;
  process?: { versions: Record<string, string>; env: Record<string, string> };
};
browserGlobals.Buffer = Buffer;
// The optional key-format package checks process.versions to decide whether Node file I/O
// is available. Keep that branch disabled without shipping a full process polyfill.
browserGlobals.process ??= { versions: {}, env: {} };

// App imports @microsoft/dev-tunnels-ssh. Load it only after the Buffer
// polyfill is installed; static ESM imports are evaluated before this module's
// body and caused the production bundle to crash before React could mount.
void import('./render').catch((error: unknown) => {
  console.error('[oh-myssh] application bootstrap failed', error);
  const root = document.getElementById('root');
  if (root) {
    root.textContent = 'Oh My SSH failed to start. Open the browser console for details.';
    root.style.cssText =
      'min-height:100vh;display:grid;place-items:center;padding:24px;background:#020617;color:#f8fafc;font:14px system-ui,sans-serif';
  }
});
