/* Lightweight UpdateService for Tauri 2 updater plugin.
 * - Dynamically imports @tauri-apps/plugin-updater when in Tauri env.
 * - Provides check on launch and manual checks.
 * - Emits callbacks for UI to present toasts/modals and show progress.
 */

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

export type UpdateInfo = {
  version?: string;
  notes?: string;
};

export type UpdateCallbacks = {
  onNoUpdate?: () => void;
  onAvailable?: (info: UpdateInfo) => void;
  onProgress?: (received: number, total?: number) => void;
  onDownloaded?: () => void;
  onError?: (err: unknown) => void;
};

class UpdateService {
  private listeners: Set<UpdateCallbacks> = new Set();
  private lastUpdate: any | null = null; // store plugin update object if provided
  private unlisten: null | (() => void) = null;

  subscribe(cb: UpdateCallbacks): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit<K extends keyof UpdateCallbacks>(event: K, ...args: Parameters<NonNullable<UpdateCallbacks[K]>>): void {
    for (const cb of this.listeners) {
      const handler = cb[event] as any;
      try {
        if (typeof handler === 'function') handler(...args);
      } catch (e) {
        console.error('UpdateService callback error:', e);
      }
    }
  }

  async init(): Promise<void> {
    if (!isTauri()) return;
    try {
      const mod: any = await import('@tauri-apps/plugin-updater');
      if (this.unlisten) {
        try { this.unlisten(); } catch {}
      }
      this.unlisten = await mod.onUpdaterEvent?.((e: any) => {
        // best-effort mapping of events
        if (e?.status === 'ERROR') {
          this.emit('onError', e?.error || 'unknown');
        }
      });
    } catch (e) {
      console.warn('Updater not available:', e);
    }
  }

  async checkForUpdates(): Promise<void> {
    if (!isTauri()) return;
    try {
      const mod: any = await import('@tauri-apps/plugin-updater');
      const update = await mod.check?.();
      this.lastUpdate = update || null;
      // Different plugin versions may return either falsy, or object with available flag
      const available = !!(update && (update.available ?? true));
      if (!available) {
        this.emit('onNoUpdate');
        return;
      }
      const info: UpdateInfo = {
        version: update?.version || update?.manifest?.version,
        notes: update?.body || update?.notes || update?.manifest?.notes,
      };
      this.emit('onAvailable', info);
    } catch (e) {
      this.emit('onError', e);
    }
  }

  async download(): Promise<void> {
    if (!isTauri()) return;
    try {
      const mod: any = await import('@tauri-apps/plugin-updater');
      const update = this.lastUpdate || (await mod.check?.());
      this.lastUpdate = update || null;
      if (!update) {
        this.emit('onError', new Error('No update available'));
        return;
      }
      // Prefer the object API if available
      if (typeof update.download === 'function') {
        await update.download((received: number, total: number) => {
          this.emit('onProgress', received, total);
        });
        this.emit('onDownloaded');
        return;
      }
      // Fallback to module-level APIs
      if (typeof mod.downloadAndInstall === 'function') {
        await mod.downloadAndInstall((progress: any) => {
          try {
            if (typeof progress === 'object' && progress) {
              const received = progress?.bytesDownloaded || progress?.received || 0;
              const total = progress?.contentLength || progress?.total || undefined;
              this.emit('onProgress', received, total);
            }
          } catch {}
        });
        this.emit('onDownloaded');
        return;
      }
      // If only download exists
      if (typeof mod.download === 'function') {
        await mod.download((progress: any) => {
          try {
            if (typeof progress === 'object' && progress) {
              const received = progress?.bytesDownloaded || progress?.received || 0;
              const total = progress?.contentLength || progress?.total || undefined;
              this.emit('onProgress', received, total);
            }
          } catch {}
        });
        this.emit('onDownloaded');
        return;
      }
      this.emit('onError', new Error('Updater download method not found'));
    } catch (e) {
      this.emit('onError', e);
    }
  }

  async installAndRelaunch(beforeRestart?: () => Promise<void> | void): Promise<void> {
    if (!isTauri()) return;
    try {
      if (beforeRestart) {
        try { await beforeRestart(); } catch (e) { console.warn('beforeRestart failed', e); }
      }
      const [{ install }, { relaunch }] = await Promise.all([
        import('@tauri-apps/plugin-updater') as any,
        import('@tauri-apps/api/process') as any,
      ]);
      if (typeof (install as any) === 'function') {
        await (install as any)();
      }
      await (relaunch as any)();
    } catch (e) {
      this.emit('onError', e);
    }
  }
}

export const updateService = new UpdateService();
