import { useState, useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { database } from "./utils/database";
import { store } from "./utils/store";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import DraggableTodo from "./components/DraggableTodo";
import DatePicker from "./components/DatePicker";
import SplashScreen from "./components/SplashScreen";

function App() {
  const [state, setState] = useState(() => store.getState());
  const [inputValue, setInputValue] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [historicalDates, setHistoricalDates] = useState<string[]>([]);
  const [futureDates, setFutureDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);
  const [isViewingFuture, setIsViewingFuture] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Format date as YYYY年MM月DD日
  const formatDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Format date string (YYYY-MM-DD) as YYYY年MM月DD日
  const formatDateString = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Function to sync data from store
  const syncData = async () => {
    try {
      const date =
        (isViewingHistorical || isViewingFuture) && selectedDate
          ? selectedDate
          : undefined;
      await store.loadTodos(date);

      // Also refresh historical and future dates
      const [historical, future] = await Promise.all([
        database.getHistoricalDates(),
        database.getFutureDates(),
      ]);
      setHistoricalDates(historical);
      setFutureDates(future);
    } catch (error) {
      console.error("Failed to sync data:", error);
    }
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
        // Load today's todos only
        await store.loadTodos();

        // Load historical and future dates
        const [historical, future] = await Promise.all([
          database.getHistoricalDates(),
          database.getFutureDates(),
        ]);
        setHistoricalDates(historical);
        setFutureDates(future);
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initDatabase();

    // Subscribe to store changes
    const unsubscribe = store.subscribe(() => {
      setState(store.getState());
    });

    return unsubscribe;
  }, []);

  // Set up event listeners for real-time updates
  useEffect(() => {
    let unlistenFunctions: (() => void)[] = [];

    const setupEventListeners = async () => {
      try {
        // Listen for todo updates
        const unlistenToggle = await listen("todo-updated", (_event) => {
          syncData();
        });

        // Listen for new todos
        const unlistenAdd = await listen("todo-added", (_event) => {
          syncData();
        });

        // Listen for todo deletions
        const unlistenDelete = await listen("todo-deleted", (_event) => {
          syncData();
        });

        // Listen for todo reordering
        const unlistenReorder = await listen("todos-reordered", (_event) => {
          syncData();
        });

        unlistenFunctions = [
          unlistenToggle,
          unlistenAdd,
          unlistenDelete,
          unlistenReorder,
        ];
      } catch (error) {
        console.error("App: Failed to setup event listeners:", error);
      }
    };

    setupEventListeners();

    // Cleanup listeners on unmount
    return () => {
      unlistenFunctions.forEach((unlisten) => unlisten());
    };
  }, [isViewingHistorical, isViewingFuture, selectedDate]); // Re-setup listeners when viewing mode changes

  // Handle main window close event to also close compact window
  useEffect(() => {
    const handleWindowClose = async () => {
      try {
        // Close compact window when main window is closed
        const compactWindow = await WebviewWindow.getByLabel("compact");
        if (compactWindow) {
          await compactWindow.close();
        }
      } catch (error) {
        console.error("Failed to close compact window:", error);
      }
    };

    const setupCloseListener = async () => {
      try {
        const mainWindow = getCurrentWindow();
        // Listen for window close event
        mainWindow.onCloseRequested(handleWindowClose);
      } catch (error) {
        console.error("Failed to setup close listener:", error);
      }
    };

    setupCloseListener();
  }, []);

  const toggleTodo = async (id: number) => {
    try {
      await store.toggleTodo(id);
      // Ensure we reload the correct date data after toggle
      const date =
        (isViewingHistorical || isViewingFuture) && selectedDate
          ? selectedDate
          : undefined;
      await store.loadTodos(date);
    } catch (error) {
      console.error("Failed to toggle todo:", error);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await store.deleteTodo(id);
      // Ensure we reload the correct date data after deletion
      const date =
        (isViewingHistorical || isViewingFuture) && selectedDate
          ? selectedDate
          : undefined;
      await store.loadTodos(date);
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  };

  const clearCompleted = async () => {
    try {
      await store.clearCompleted();
      // Ensure we reload the correct date data after clearing
      const date =
        (isViewingHistorical || isViewingFuture) && selectedDate
          ? selectedDate
          : undefined;
      await store.loadTodos(date);
    } catch (error) {
      console.error("Failed to clear completed todos:", error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = state.todos.findIndex((todo) => todo.id === active.id);
      const newIndex = state.todos.findIndex((todo) => todo.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTodos = arrayMove(state.todos, oldIndex, newIndex);

        // Update store with new order
        try {
          const todoIds = newTodos.map((todo) => todo.id);
          await store.reorderTodos(todoIds);
        } catch (error) {
          console.error("Failed to reorder todos:", error);
        }
      }
    }
  };

  const openDatePicker = async () => {
    try {
      const [historical, future] = await Promise.all([
        database.getHistoricalDates(),
        database.getFutureDates(),
      ]);
      setHistoricalDates(historical);
      setFutureDates(future);
      setShowDatePicker(true);
    } catch (error) {
      console.error("Failed to get dates:", error);
    }
  };

  const handleDateSelect = async (date: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];

      if (date === today) {
        // If selecting today, return to today view
        setSelectedDate(null);
        setIsViewingHistorical(false);
        setIsViewingFuture(false);
        await store.loadTodos();
      } else if (date < today) {
        // If selecting historical date
        setSelectedDate(date);
        await store.loadTodos(date);
        setIsViewingHistorical(true);
        setIsViewingFuture(false);
      } else {
        // If selecting future date
        setSelectedDate(date);
        await store.loadTodos(date);
        setIsViewingHistorical(false);
        setIsViewingFuture(true);
      }

      setShowDatePicker(false);
    } catch (error) {
      console.error("Failed to load todos for selected date:", error);
    }
  };

  const returnToToday = async () => {
    try {
      setSelectedDate(null);
      setIsViewingHistorical(false);
      setIsViewingFuture(false);
      await store.loadTodos();
    } catch (error) {
      console.error("Failed to return to today:", error);
    }
  };

  // Override addTodo to prevent adding todos when viewing historical data
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isViewingHistorical) {
      try {
        // If viewing future date, add todo to that date, otherwise add to today
        const targetDate =
          isViewingFuture && selectedDate ? selectedDate : undefined;
        await store.addTodo(inputValue.trim(), targetDate);
        setInputValue("");
      } catch (error) {
        console.error("Failed to add todo:", error);
      }
    }
  };

  const openCompactMode = async () => {
    try {
      const windowLabel = "compact";

      // Check if compact window already exists by trying to get it
      let existingWindow = null;
      try {
        existingWindow = await WebviewWindow.getByLabel(windowLabel);
        // Try to interact with window to verify it actually exists
        if (existingWindow) {
          await existingWindow.show();
        }
      } catch (error) {
        existingWindow = null;
      }

      if (existingWindow) {
        try {
          await existingWindow.show();
          await existingWindow.setFocus();
        } catch (showError) {
          console.error("Failed to show existing window:", showError);
        }
      } else {
        // Calculate position for top-right 1/8 of screen
        const windowWidth = 350;
        const windowHeight = 50;

        // Get current monitor information
        const monitor = await currentMonitor();

        // Fallback to default screen size if monitor is null
        const screenWidth = monitor?.size?.width || 1920;
        const screenHeight = monitor?.size?.height || 1080;

        // Calculate position: top-right 1/8 of screen, height 1/6 from top
        // 1/8 from right = screenWidth - (screenWidth / 8) - windowWidth
        // 1/6 from top = screenHeight / 6
        const xOffset = screenWidth - screenWidth / 10 - windowWidth;
        const yOffset = screenHeight / 8; // 1/6 from top

        const compactWindow = new WebviewWindow(windowLabel, {
          url: "/compact",
          width: windowWidth,
          height: windowHeight,
          resizable: false,
          decorations: false,
          center: false,
          visible: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          x: xOffset,
          y: yOffset,
          backgroundColor: "#1e293b",
        });

        // Additional window operations to ensure visibility
        setTimeout(async () => {
          try {
            await compactWindow.show();
            await compactWindow.setFocus();
            await compactWindow.unminimize();
          } catch (error) {
            console.error("Failed to perform window operations:", error);
          }
        }, 100);
      }

      // Hide main window
      const mainWebview = getCurrentWindow();
      await mainWebview.hide();
    } catch (error) {
      console.error("Failed to open compact mode:", error);
    }
  };

  const filteredTodos = state.todos.filter((todo) => {
    if (filter === "active") return !todo.completed;
    if (filter === "completed") return todo.completed;
    return true;
  });

  const todoCounts = store.getTodoCounts();
  const activeCount = todoCounts.active;
  const completedCount = todoCounts.completed;

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-slate-800">
      <div className="container mx-auto px-4 py-6 max-w-md">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="relative mb-4">
            {/* 标题区域 - 绝对居中 */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center mb-2 min-h-[2.5rem]">
                <button
                  onClick={openDatePicker}
                  className="text-3xl font-bold text-white hover:text-gray-300 transition-colors cursor-pointer bg-transparent border-none p-0"
                  title="点击选择日期"
                >
                  {(isViewingHistorical || isViewingFuture) && selectedDate
                    ? formatDateString(selectedDate)
                    : formatDate()}
                </button>
              </div>

              <p className="text-gray-400 text-sm text-center">
                {isViewingHistorical || isViewingFuture ? (
                  <button
                    onClick={returnToToday}
                    className="text-gray-500 hover:text-gray-400 transition-colors cursor-pointer bg-transparent border-none p-0"
                    title="返回今天"
                  >
                    返回今天
                  </button>
                ) : (
                  <button
                    onClick={openCompactMode}
                    className="text-gray-500 hover:text-gray-400 transition-colors cursor-pointer bg-transparent border-none p-0"
                    title="打开小窗"
                  >
                    打开小窗
                  </button>
                )}
              </p>
            </div>
          </div>
        </header>

        {/* Add Todo Form */}
        <form onSubmit={handleAddTodo} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                isViewingHistorical
                  ? "历史数据模式 - 无法添加任务"
                  : isViewingFuture
                  ? "未来日期 - 可添加任务"
                  : "What needs to be done?"
              }
              disabled={isViewingHistorical}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm ${
                isViewingHistorical
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600"
                  : "bg-gray-800 text-white border-gray-600"
              }`}
            />
            <button
              type="submit"
              disabled={isViewingHistorical}
              className={`px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-gray-800 transition-colors shadow-sm text-sm font-medium ${
                isViewingHistorical
                  ? "bg-gray-600 text-gray-500 cursor-not-allowed"
                  : isViewingFuture
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Add Task
            </button>
          </div>
        </form>

        {/* Stats */}
        {state.todos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-blue-400">
                {state.todos.length}
              </div>
              <div className="text-xs text-gray-400">Total</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-green-400">
                {activeCount}
              </div>
              <div className="text-xs text-gray-400">Active</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-purple-400">
                {completedCount}
              </div>
              <div className="text-xs text-gray-400">Completed</div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        {state.todos.length > 0 && (
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
                items={filteredTodos.map((todo) => todo.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredTodos.map((todo) => (
                  <DraggableTodo
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    readonly={isViewingHistorical}
                    disableCompletion={isViewingFuture}
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
              Clear {completedCount} completed task
              {completedCount > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePicker
          historicalDates={historicalDates}
          futureDates={futureDates}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onClose={() => setShowDatePicker(false)}
          currentDate={new Date().toISOString().split("T")[0]}
        />
      )}
    </div>
  );
}

export default App;
