import { useEffect, useState } from 'react';

function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

let appWindow: {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChanged: (cb: (maximized: boolean) => void) => Promise<() => void>;
} | null = null;

async function getWindow() {
  if (!appWindow && isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    appWindow = {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      isMaximized: () => win.isMaximized(),
      onMaximizeChanged: (cb: (maximized: boolean) => void) =>
        win.onResized(async () => {
          cb(await win.isMaximized());
        }),
    };
  }
  return appWindow;
}

export function useTauri() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    getWindow().then(async (w) => {
      if (!w || cancelled) return;
      setIsMaximized(await w.isMaximized());
      const unlisten = await w.onMaximizeChanged(setIsMaximized);
      if (cancelled) unlisten();
    });
    return () => { cancelled = true; };
  }, []);

  const minimize = async () => (await getWindow())?.minimize();
  const toggleMaximize = async () => (await getWindow())?.toggleMaximize();
  const close = async () => (await getWindow())?.close();

  return { isTauri: isTauri(), isMaximized, minimize, toggleMaximize, close };
}
