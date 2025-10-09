import { useState, useEffect } from "react";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { database, Todo } from './utils/database';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import DraggableTodo from './components/DraggableTodo';
import DatePicker from './components/DatePicker';

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [historicalDates, setHistoricalDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);

  // Format date as MM月DD日
  const formatDate = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${month}月${day}日`;
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize database and load todos on mount
  useEffect(() => {
    const initDatabase = async () => {
      try {
        await database.init();
        const loadedTodos = await database.getTodos();
        setTodos(loadedTodos);

        // Load historical dates
        const dates = await database.getHistoricalDates();
        setHistoricalDates(dates);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initDatabase();
  }, []);

  // Handle main window close event to also close compact window
  useEffect(() => {
    const handleWindowClose = async () => {
      try {
        // Close compact window when main window is closed
        const compactWindow = await WebviewWindow.getByLabel('compact');
        if (compactWindow) {
          await compactWindow.close();
        }
      } catch (error) {
        console.error('Failed to close compact window:', error);
      }
    };

    const setupCloseListener = async () => {
      try {
        const mainWindow = getCurrentWindow();
        // Listen for window close event
        mainWindow.onCloseRequested(handleWindowClose);
      } catch (error) {
        console.error('Failed to setup close listener:', error);
      }
    };

    setupCloseListener();
  }, []);

  
  const toggleTodo = async (id: number) => {
    try {
      const updatedTodo = await database.toggleTodo(id);
      setTodos(todos.map(todo =>
        todo.id === id ? updatedTodo : todo
      ));
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await database.deleteTodo(id);
      setTodos(todos.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const clearCompleted = async () => {
    try {
      await database.clearCompleted();
      setTodos(todos.filter(todo => !todo.completed));
    } catch (error) {
      console.error('Failed to clear completed todos:', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = todos.findIndex((todo) => todo.id === active.id);
      const newIndex = todos.findIndex((todo) => todo.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTodos = arrayMove(todos, oldIndex, newIndex);
        setTodos(newTodos);

        // Update database with new order
        try {
          const todoIds = newTodos.map(todo => todo.id);
          await database.reorderTodos(todoIds);
        } catch (error) {
          console.error('Failed to reorder todos in database:', error);
          // Revert to original order if database update fails
          setTodos(todos);
        }
      }
    }
  };

  const openDatePicker = async () => {
    try {
      const dates = await database.getHistoricalDates();
      setHistoricalDates(dates);
      setShowDatePicker(true);
    } catch (error) {
      console.error('Failed to get historical dates:', error);
    }
  };

  const handleDateSelect = async (date: string) => {
    try {
      setSelectedDate(date);
      const historicalTodos = await database.getTodosByDate(date);
      setTodos(historicalTodos);
      setIsViewingHistorical(true);
      setShowDatePicker(false);
    } catch (error) {
      console.error('Failed to load historical todos:', error);
    }
  };

  const returnToToday = async () => {
    try {
      setSelectedDate(null);
      setIsViewingHistorical(false);
      const currentTodos = await database.getTodos();
      setTodos(currentTodos);
    } catch (error) {
      console.error('Failed to return to today:', error);
    }
  };

  // Override addTodo to prevent adding todos when viewing historical data
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isViewingHistorical) {
      try {
        await database.addTodo(inputValue.trim());
        // Reload all todos to maintain proper sorting order
        const updatedTodos = await database.getTodos();
        setTodos(updatedTodos);
        setInputValue("");
      } catch (error) {
        console.error('Failed to add todo:', error);
      }
    }
  };

  const openCompactMode = async () => {
    console.log('Opening compact mode...');
    try {
      const windowLabel = 'compact';

      // Check if compact window already exists by trying to get it
      let existingWindow = null;
      try {
        existingWindow = WebviewWindow.getByLabel(windowLabel);
        // Try to interact with window to verify it actually exists
        if (existingWindow) {
          await existingWindow.show();
        }
      } catch (error) {
        console.log('Compact window does not exist, will create new one');
        existingWindow = null;
      }

      if (existingWindow) {
        console.log('Compact window already exists, showing it');
        try {
          // Recalculate position for current monitor
          const monitor = await currentMonitor();
          const screenWidth = monitor?.size?.width || 1920;
          const screenHeight = monitor?.size?.height || 1080;
          const windowWidth = 500;

          // Calculate position: top-right 1/8 of screen, height 1/6 from top
          // 1/8 from right = screenWidth - (screenWidth / 8) - windowWidth
          // Minimum 100px from right edge
          // 1/6 from top = screenHeight / 6
          const xOffset = Math.min(screenWidth - (screenWidth / 10) - windowWidth, screenWidth - windowWidth - 50);
          const yOffset = screenHeight / 10; // 1/6 from top

          await existingWindow.setPosition(xOffset, yOffset);
          await existingWindow.show();
          await existingWindow.setFocus();
          console.log('Existing compact window positioned and shown at:', { x: xOffset, y: yOffset });
        } catch (showError) {
          console.error('Failed to show existing window:', showError);
        }
      } else {
        console.log('Creating new compact window:', windowLabel);

        // Calculate position for top-right 1/8 of screen
        const windowWidth = 500;
        const windowHeight = 50;

        // Get current monitor information
        const monitor = await currentMonitor();

        // Fallback to default screen size if monitor is null
        const screenWidth = monitor?.size?.width || 1920;
        const screenHeight = monitor?.size?.height || 1080;

        // Calculate position: top-right 1/8 of screen, height 1/6 from top
        // 1/8 from right = screenWidth - (screenWidth / 8) - windowWidth
        // 1/6 from top = screenHeight / 6
        const xOffset = screenWidth - (screenWidth / 10) - windowWidth;
        const yOffset = screenHeight / 8; // 1/6 from top

        console.log('Calculated position:', { x: xOffset, y: yOffset, screenWidth, screenHeight });

        const compactWindow = new WebviewWindow(windowLabel, {
          url: '/compact',
          width: windowWidth,
          height: windowHeight,
          resizable: false,
          decorations: false,
          center: false,
          visible: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          x: xOffset,
          y: yOffset
        });

        // Wait for window to be created and ensure it's positioned correctly
        compactWindow.once('tauri://created', () => {
          console.log('Compact window created successfully');
          compactWindow.setPosition(xOffset, yOffset);
        });

        console.log('Compact window created:', compactWindow);

        // Additional window operations to ensure visibility
        setTimeout(async () => {
          try {
            await compactWindow.show();
            await compactWindow.setFocus();
            await compactWindow.unminimize();
            console.log('Window operations completed');
          } catch (error) {
            console.error('Failed to perform window operations:', error);
          }
        }, 100);
      }

      // Hide main window
      const mainWebview = getCurrentWindow();
      await mainWebview.hide();

    } catch (error) {
      console.error('Failed to open compact mode:', error);
    }
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === "active") return !todo.completed;
    if (filter === "completed") return todo.completed;
    return true;
  });

  const activeCount = todos.filter(todo => !todo.completed).length;
  const completedCount = todos.filter(todo => todo.completed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-slate-800">
      <div className="container mx-auto px-4 py-6 max-w-md">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              {isViewingHistorical ? (
                <div className="flex items-center justify-center gap-2 mb-2">
                  <button
                    onClick={returnToToday}
                    className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    title="返回今天"
                  >
                    ← 返回今天
                  </button>
                  <h1 className="text-3xl font-bold text-white">
                    📅 {selectedDate}
                  </h1>
                </div>
              ) : (
                <button
                  onClick={openDatePicker}
                  className="text-3xl font-bold text-white mb-2 hover:text-blue-400 transition-colors cursor-pointer"
                  title="点击选择历史日期"
                >
                  ✨ {formatDate()}
                </button>
              )}
              <p className="text-gray-400 text-sm">
                {isViewingHistorical ? "历史数据 - 只读模式" : "Organize your tasks with style"}
              </p>
            </div>
            <button
              onClick={openCompactMode}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              title="Compact Mode"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </header>

        {/* Add Todo Form */}
        <form onSubmit={handleAddTodo} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isViewingHistorical ? "历史数据模式 - 无法添加任务" : "What needs to be done?"}
              disabled={isViewingHistorical}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm ${
                isViewingHistorical
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                  : 'bg-gray-800 text-white border-gray-600'
              }`}
            />
            <button
              type="submit"
              disabled={isViewingHistorical}
              className={`px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-gray-800 transition-colors shadow-sm text-sm font-medium ${
                isViewingHistorical
                  ? 'bg-gray-600 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              Add Task
            </button>
          </div>
        </form>

        {/* Stats */}
        {todos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-blue-400">{todos.length}</div>
              <div className="text-xs text-gray-400">Total</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-green-400">{activeCount}</div>
              <div className="text-xs text-gray-400">Active</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-purple-400">{completedCount}</div>
              <div className="text-xs text-gray-400">Completed</div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        {todos.length > 0 && (
          <div className="flex gap-2 mb-6 bg-gray-800 rounded-lg p-1 shadow-sm">
            {(["all", "active", "completed"] as const).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`flex-1 py-1.5 px-3 rounded-md transition-colors text-sm font-medium ${
                  filter === filterType
                    ? "bg-blue-500 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Todo List */}
        <div className="space-y-2 mb-6">
          {filteredTodos.length === 0 ? (
            <div className="text-center py-8 bg-gray-800 rounded-lg shadow-sm">
              <div className="text-5xl mb-3">📝</div>
              <p className="text-gray-400 text-sm">
                {filter === "completed"
                  ? "No completed tasks yet"
                  : filter === "active"
                  ? "No active tasks"
                  : "Start by adding a task above!"}
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredTodos.map(todo => todo.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredTodos.map((todo) => (
                  <DraggableTodo
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    readonly={isViewingHistorical}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Clear Completed */}
        {completedCount > 0 && (
          <div className="flex justify-center">
            <button
              onClick={clearCompleted}
              className="px-3 py-1.5 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors text-sm"
            >
              Clear {completedCount} completed task{completedCount > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePicker
          historicalDates={historicalDates}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onClose={() => setShowDatePicker(false)}
          currentDate={new Date().toISOString().split('T')[0]}
        />
      )}
    </div>
  );
}

export default App;