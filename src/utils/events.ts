export type UnlistenFn = () => void;

function getTestId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('testId') || 'default';
  } catch {
    return 'default';
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (isTauri()) return null;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(`rtodo-events-${getTestId()}`);
  }
  return channel;
}

export async function listen<T = any>(event: string, handler: (event: { event: string; payload: T }) => void): Promise<UnlistenFn> {
  if (isTauri()) {
    // Dynamically import tauri API only when available
    const mod: any = await import('@tauri-apps/api/event');
    const unlisten = await mod.listen(event, (e: any) => handler({ event: e.event, payload: e.payload }));
    return () => {
      try { unlisten(); } catch {}
    };
  }

  const ch = getChannel();
  const listener = (msg: MessageEvent) => {
    const data = msg.data;
    if (data && data.event === event) {
      handler({ event, payload: data.payload });
    }
  };
  ch?.addEventListener('message', listener);
  return () => ch?.removeEventListener('message', listener);
}

export async function emit<T = any>(event: string, payload?: T): Promise<void> {
  if (isTauri()) {
    const mod: any = await import('@tauri-apps/api/event');
    await mod.emit(event, payload);
    return;
  }
  const ch = getChannel();
  ch?.postMessage({ event, payload });
}
