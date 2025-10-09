import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
}

function CompactApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [firstTodo, setFirstTodo] = useState<Todo | null>(null);

  // Load todos from localStorage and get first todo
  useEffect(() => {
    const loadTodos = () => {
      try {
        const savedTodos = localStorage.getItem('todos');
        if (savedTodos) {
          const parsedTodos = JSON.parse(savedTodos).map((todo: any) => ({
            ...todo,
            createdAt: new Date(todo.createdAt)
          }));
          setTodos(parsedTodos);
          if (parsedTodos.length > 0) {
            setFirstTodo(parsedTodos[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load todos:', error);
      }
    };

    loadTodos();

    // Set up interval to check for updates
    const interval = setInterval(loadTodos, 1000);

    return () => clearInterval(interval);
  }, []);

  const closeWindow = async () => {
    try {
      // Close the compact window
      const compactWindow = getCurrentWindow();
      await compactWindow.close();

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
      console.error('Failed to close window:', error);
    }
  };

  const openMainApp = async () => {
    try {
      // Close the compact window
      const compactWindow = getCurrentWindow();
      await compactWindow.close();

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
      console.error('Failed to open main window:', error);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-r from-gray-900 to-slate-800 flex items-center justify-between px-4 select-none">
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={openMainApp}
      >
        <span className="text-blue-400 text-lg">
          📋
        </span>
        <div className="flex-1 min-w-0">
          {firstTodo ? (
            <div>
              <p className={`text-white text-sm font-medium truncate ${
                firstTodo.completed ? "line-through opacity-60" : ""
              }`}>
                {firstTodo.text}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {firstTodo.createdAt.toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm truncate">
              暂无任务 - 点击打开主应用
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {todos.length > 1 && (
          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
            +{todos.length - 1}
          </span>
        )}

        <button
          onClick={closeWindow}
          className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
          title="关闭窗口"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default CompactApp;