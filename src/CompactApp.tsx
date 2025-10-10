import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { Todo, database } from './utils/database';
import { store } from './utils/store';

function CompactApp() {
  const [state, setState] = useState(() => store.getState());
  const [firstTodo, setFirstTodo] = useState<Todo | null>(() => store.getFirstIncompleteTodo());

  
  // Initialize database and load todos on mount
  useEffect(() => {
    const initDatabase = async () => {
      try {
        await database.init();
        await store.loadTodos();
      } catch (error) {
        console.error('Failed to initialize database in CompactApp:', error);
      }
    };

    initDatabase();

    // Subscribe to store changes
    const unsubscribe = store.subscribe(() => {
      const newState = store.getState();
      setState(newState);
      setFirstTodo(store.getFirstIncompleteTodo());
    });

    return unsubscribe;
  }, []);

  // Set up event listeners for real-time updates
  useEffect(() => {
    let unlistenFunctions: (() => void)[] = [];

    const setupEventListeners = async () => {
      try {
        // Listen for todo updates
        const unlistenToggle = await listen('todo-updated', (_event) => {
          store.loadTodos();
        });

        // Listen for new todos
        const unlistenAdd = await listen('todo-added', (_event) => {
          store.loadTodos();
        });

        // Listen for todo deletions
        const unlistenDelete = await listen('todo-deleted', (_event) => {
          store.loadTodos();
        });

        // Listen for todo reordering
        const unlistenReorder = await listen('todos-reordered', (_event) => {
          store.loadTodos();
        });

        unlistenFunctions = [unlistenToggle, unlistenAdd, unlistenDelete, unlistenReorder];
      } catch (error) {
        console.error('CompactApp: Failed to setup event listeners:', error);
      }
    };

    setupEventListeners();

    // Cleanup listeners on unmount
    return () => {
      unlistenFunctions.forEach(unlisten => unlisten());
    };
  }, []);

  const toggleTodo = async (id: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent opening main window when clicking checkbox
    try {
      await store.toggleTodo(id);
    } catch (error) {
      console.error('Failed to toggle todo in CompactApp:', error);
    }
  };

  const exitApp = async () => {
    try {
      // Hide the compact window instead of closing it
      const compactWindow = getCurrentWindow();
      await compactWindow.hide();

      // Try to focus and show the main window
      const mainWindow = await WebviewWindow.getByLabel('main');
      if (mainWindow) {
        try {
          await mainWindow.show();
          await mainWindow.setFocus();
        } catch (focusError) {
          console.error('Failed to focus main window:', focusError);
        }
      } else {
        console.error('Main window not found');
      }
    } catch (error) {
      console.error('Failed to hide window:', error);
    }
  };

  const openMainApp = async () => {
    try {
      // Hide the compact window instead of closing it
      const compactWindow = getCurrentWindow();
      await compactWindow.hide();

      // Try to focus and show the main window
      const mainWindow = await WebviewWindow.getByLabel('main');
      if (mainWindow) {
        try {
          await mainWindow.show();
          await mainWindow.setFocus();
        } catch (focusError) {
          console.error('Failed to focus main window:', focusError);
        }
      } else {
        console.error('Main window not found');
      }
    } catch (error) {
      console.error('Failed to open main window:', error);
    }
  };

  return (
    <div
      className="h-screen bg-gradient-to-r from-gray-900 to-slate-800 flex items-center justify-between px-4 select-none"
      data-tauri-drag-region
    >
      {/* 中间点击区域 - TODO内容 */}
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={openMainApp}
      >
        {firstTodo ? (
          <input
            type="checkbox"
            checked={firstTodo.completed}
            onChange={(e) => {
          e.stopPropagation();
          toggleTodo(firstTodo.id, e as any);
        }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 text-blue-500 rounded focus:ring-blue-400 focus:ring-2 cursor-pointer flex-shrink-0"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          {firstTodo ? (
            <div>
              <p className="text-white text-sm font-medium truncate">
                {firstTodo.text}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {firstTodo.createdAt ? firstTodo.createdAt.toLocaleString() : ''}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm truncate">
              暂无待办任务 - 点击打开主应用
            </p>
          )}
        </div>
      </div>

      {/* 右侧控制区域 */}
      <div className="flex items-center gap-2">
        {state.todos.filter(todo => !todo.completed).length > 1 && (
          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
            +{state.todos.filter(todo => !todo.completed).length - 1}
          </span>
        )}

        <button
          onClick={exitApp}
          className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
          title="关闭精简窗口"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 右侧拖拽区域 */}
        <div className="w-4" data-tauri-drag-region></div>
      </div>
    </div>
  );
}

export default CompactApp;