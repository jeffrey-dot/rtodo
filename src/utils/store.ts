import { database, Todo } from './database';

interface TodoStore {
  todos: Todo[];
  loading: boolean;
  error: string | null;
}

class Store {
  private listeners: Set<() => void> = new Set();
  private state: TodoStore = {
    todos: [],
    loading: false,
    error: null
  };
  private currentDate: string | undefined;

  // Get current state
  getState(): TodoStore {
    return { ...this.state };
  }

  // Subscribe to state changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Update state and notify listeners
  private setState(updates: Partial<TodoStore>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener());
  }

  // Load todos from database
  async loadTodos(date?: string): Promise<void> {
    this.currentDate = date;
    this.setState({ loading: true, error: null });
    try {
      let todos: Todo[];
      if (date) {
        todos = await database.getTodosByDate(date);
      } else {
        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        todos = await database.getTodosByDate(today);
      }
      this.setState({ todos, loading: false });
    } catch (error) {
      this.setState({ loading: false, error: String(error) });
    }
  }

  // Add new todo
  async addTodo(text: string, date?: string): Promise<void> {
    try {
      await database.addTodo(text, date);
      await this.loadTodos(date); // Reload todos for the specific date to maintain proper order
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  // Toggle todo completion
  async toggleTodo(id: number): Promise<void> {
    try {
      await database.toggleTodo(id);
      // If currentDate is undefined, don't reload (let the app handle it)
      if (this.currentDate !== undefined) {
        await this.loadTodos(this.currentDate);
      }
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  // Delete todo
  async deleteTodo(id: number): Promise<void> {
    try {
      await database.deleteTodo(id);
      // If currentDate is undefined, don't reload (let the app handle it)
      // This prevents accidentally loading today's data when viewing historical/future dates
      if (this.currentDate !== undefined) {
        await this.loadTodos(this.currentDate);
      }
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  // Reorder todos
  async reorderTodos(todoIds: number[]): Promise<void> {
    try {
      await database.reorderTodos(todoIds);
      await this.loadTodos(this.currentDate); // Reload to get updated order
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  // Clear completed todos
  async clearCompleted(): Promise<void> {
    try {
      await database.clearCompleted();
      // If currentDate is undefined, don't reload (let the app handle it)
      if (this.currentDate !== undefined) {
        await this.loadTodos(this.currentDate);
      }
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  // Get first incomplete todo for compact view
  getFirstIncompleteTodo(): Todo | null {
    const incompleteTodos = this.state.todos.filter(todo => !todo.completed);
    return incompleteTodos.length > 0 ? incompleteTodos[0] : null;
  }

  // Get todo counts
  getTodoCounts(): { total: number; active: number; completed: number } {
    const total = this.state.todos.length;
    const active = this.state.todos.filter(todo => !todo.completed).length;
    const completed = this.state.todos.filter(todo => todo.completed).length;
    return { total, active, completed };
  }
}

export const store = new Store();