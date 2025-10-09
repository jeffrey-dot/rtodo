import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { database, Todo } from './utils/database';

function CompactApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [firstTodo, setFirstTodo] = useState<Todo | null>(null);

  // Initialize database and load todos
  useEffect(() => {
    const initializeAndLoadTodos = async () => {
      try {
        // First initialize the database
        await database.init();

        // Then load todos (only incomplete ones)
        const loadedTodos = await database.getTodos();
        const incompleteTodos = loadedTodos.filter(todo => !todo.completed);
        setTodos(incompleteTodos);
        if (incompleteTodos.length > 0) {
          setFirstTodo(incompleteTodos[0]);
        }
        console.log('CompactApp: Loaded', incompleteTodos.length, 'incomplete todos');
      } catch (error) {
        console.error('Failed to initialize or load todos in CompactApp:', error);
      }
    };

    initializeAndLoadTodos();
  }, []);

  const closeWindow = async () => {
    try {
      // Hide the compact window instead of closing it
      const compactWindow = getCurrentWindow();
      await compactWindow.hide();

      // Try to focus the main window
      const mainWindow = WebviewWindow.getByLabel('main');
      if (mainWindow) {
        try {
          await mainWindow.setFocus();
          await mainWindow.show();
        } catch (focusError) {
          console.error('Failed to focus main window:', focusError);
        }
      }
    } catch (error) {
      console.error('Failed to hide window:', error);
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
      }
    } catch (error) {
      console.error('Failed to open main window:', error);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-r from-gray-900 to-slate-800 flex items-center justify-between px-4 select-none">
      {/* 左侧拖拽区域 */}
      <div className="flex items-center gap-2 w-20" data-tauri-drag-region>
        <span className="text-blue-400 text-lg">
          📋
        </span>
      </div>

      {/* 中间点击区域 - TODO内容 */}
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={openMainApp}
      >
        <div className="flex-1 min-w-0">
          {firstTodo ? (
            <div>
              <p className="text-white text-sm font-medium truncate">
                {firstTodo.text}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {firstTodo.createdAt.toLocaleString()}
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
        {todos.length > 1 && (
          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
            +{todos.length - 1}
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