import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
  onCompactMode: () => void;
}

function TitleBar({ onCompactMode }: TitleBarProps) {
  const window = getCurrentWindow();

  const handleMinimize = () => {
    window.minimize();
  };

  const handleMaximize = async () => {
    const maximized = await window.isMaximized();
    if (maximized) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  };

  const handleClose = () => {
    window.close();
  };

  return (
    <div
      className="flex items-center justify-between h-8 bg-gray-900 border-b border-gray-800 select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center px-2 flex-1" style={{ WebkitAppRegion: 'drag' }}>
        <span className="text-white text-sm font-medium">rtodo</span>
      </div>

      <div className="flex items-center">
        <button
          onClick={onCompactMode}
          className="px-3 h-8 flex items-center justify-center text-white hover:bg-gray-700 transition-colors text-xs"
          title="Compact Mode"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        <button
          onClick={handleMinimize}
          className="px-3 h-8 flex items-center justify-center text-white hover:bg-gray-700 transition-colors"
          title="Minimize"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="px-3 h-8 flex items-center justify-center text-white hover:bg-gray-700 transition-colors"
          title="Maximize"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V16m0 0h12m0 0V8m0 0H4" />
          </svg>
        </button>

        <button
          onClick={handleClose}
          className="px-3 h-8 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
          title="Close"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;