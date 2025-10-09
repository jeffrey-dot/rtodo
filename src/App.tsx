import { useState } from "react";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const newTodo: Todo = {
        id: Date.now(),
        text: inputValue.trim(),
        completed: false,
        createdAt: new Date(),
      };
      setTodos([newTodo, ...todos]);
      setInputValue("");
    }
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const clearCompleted = () => {
    setTodos(todos.filter(todo => !todo.completed));
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
          <h1 className="text-3xl font-bold text-white mb-2">
            ✨ TODO LIST
          </h1>
          <p className="text-gray-400 text-sm">
            Organize your tasks with style
          </p>
        </header>

        {/* Add Todo Form */}
        <form onSubmit={addTodo} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 px-3 py-2.5 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-gray-800 transition-colors shadow-sm text-sm font-medium"
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
            filteredTodos.map((todo) => (
              <div
                key={todo.id}
                className="bg-gray-800 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                    className="w-4 h-4 text-blue-500 rounded focus:ring-blue-400 focus:ring-2 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p
                      className={`${
                        todo.completed
                          ? "line-through text-gray-400"
                          : "text-white"
                      } text-sm`}
                    >
                      {todo.text}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {todo.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-1.5 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
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
    </div>
  );
}

export default App;