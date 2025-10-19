import { emit } from './events';
import { measure } from './telemetry';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_at: string;
  sort_order: number;
  createdAt?: Date;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

// ---------------- Tauri (SQLite) implementation ----------------
class TauriDatabaseService {
  private db: any | null = null;
  private initialized = false;
  // Ensure single-writer semantics for write operations
  private writeChain: Promise<any> = Promise.resolve();

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(fn);
    // prevent unhandled rejection from breaking the chain
    this.writeChain = next.then(() => undefined).catch(() => undefined);
    return next;
  }

  private async begin(): Promise<void> {
    await this.db!.execute('BEGIN IMMEDIATE');
  }

  private async commit(): Promise<void> {
    await this.db!.execute('COMMIT');
  }

  private async rollback(): Promise<void> {
    try { await this.db!.execute('ROLLBACK'); } catch {}
  }

  async init(): Promise<void> {
    try {
      const [{ appDataDir }, { default: Database }] = await Promise.all([
        import('@tauri-apps/api/path'),
        import('@tauri-apps/plugin-sql'),
      ]);

      const dataDir = await appDataDir();
      const dbPath = `sqlite:${dataDir.replace(/\\/g, '/')}/rtodo.db`;
      // @ts-ignore dynamic module
      this.db = await (Database as any).load(dbPath);

      // SQLite tuning pragmas
      try {
        await this.db.execute(`PRAGMA journal_mode=WAL`);
        await this.db.execute(`PRAGMA synchronous=NORMAL`);
        await this.db.execute(`PRAGMA busy_timeout=5000`);
        await this.db.execute(`PRAGMA foreign_keys=ON`);
        await this.db.execute(`PRAGMA cache_size=-20000`); // ~20MB cache
        await this.db.execute(`PRAGMA temp_store=MEMORY`);
      } catch (e) {
        console.warn('SQLite PRAGMA setup failed or partially applied:', e);
      }

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        )
      `);

      // Helpful indexes
      try {
        await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_todos_completed_sort_created ON todos (completed, sort_order, created_at DESC)`);
      } catch {}
      try {
        // Expression index to accelerate date-based queries if supported by SQLite version
        await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_todos_date_completed_sort ON todos (date(created_at), completed, sort_order)`);
      } catch {}

      // Backfill sort_order for legacy rows
      await this.db.execute(`
        UPDATE todos SET sort_order = id WHERE sort_order = 0
      `);

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private checkInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized');
    }
  }

  async getTodos(): Promise<Todo[]> {
    this.checkInitialized();
    const result = await this.db.select('SELECT * FROM todos ORDER BY completed ASC, sort_order ASC, created_at DESC');
    return (result as any[]).map((todo: any) => ({
      ...todo,
      completed: Boolean(todo.completed),
      createdAt: new Date(todo.created_at),
    }));
  }

  async addTodo(text: string, date?: string): Promise<Todo> {
    this.checkInitialized();
    return measure('db.addTodo', async () => this.serialize(async () => {
      const now = date ? new Date(date).toISOString() : new Date().toISOString();
      try {
        await this.begin();
        const maxSortResult = (await this.db!.select(
          `SELECT MAX(sort_order) as max_sort FROM todos WHERE completed = 0 AND date(created_at) = date(?)`,
          [now]
        )) as any[];
        const nextSort = (maxSortResult[0]?.max_sort || 0) + 1;

        const result = (await this.db!.select(
          'INSERT INTO todos (text, completed, created_at, sort_order) VALUES (?, ?, ?, ?) RETURNING *',
          [text, 0, now, nextSort]
        )) as any[];
        await this.commit();

        const newTodo: Todo = {
          ...result[0],
          completed: Boolean(result[0].completed),
          createdAt: new Date(result[0].created_at),
        };

        await emit('todo-added', { todo: newTodo });
        return newTodo;
      } catch (e) {
        await this.rollback();
        throw e;
      }
    }));
  }

  async updateTodo(id: number, updates: Partial<Pick<Todo, 'text' | 'completed'>>): Promise<Todo> {
    this.checkInitialized();
    return this.serialize(async () => {
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = Object.values(updates).map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value));
      values.push(String(id));

      const result = (await this.db!.select(`UPDATE todos SET ${setClause} WHERE id = ? RETURNING *`, values as any[])) as any[];
      return {
        ...result[0],
        completed: Boolean(result[0].completed),
        createdAt: new Date(result[0].created_at),
      };
    });
  }

  async deleteTodo(id: number): Promise<boolean> {
    this.checkInitialized();
    return this.serialize(async () => {
      await this.db!.execute('DELETE FROM todos WHERE id = ?', [String(id)]);
      await emit('todo-deleted', { id });
      return true;
    });
  }

  async clearCompleted(): Promise<number> {
    this.checkInitialized();
    const result = await this.db.execute('DELETE FROM todos WHERE completed = 1');
    return result.rowsAffected || 0;
  }

  async toggleTodo(id: number): Promise<Todo> {
    this.checkInitialized();
    return measure('db.toggle', async () => this.serialize(async () => {
      try {
        await this.begin();
        const result = (await this.db!.select('UPDATE todos SET completed = NOT completed WHERE id = ? RETURNING *', [String(id)])) as any[];
        const updatedTodo: Todo = {
          ...result[0],
          completed: Boolean(result[0].completed),
          createdAt: new Date(result[0].created_at),
        };

        await this.reorderAfterStatusChange(true);
        await this.commit();

        await emit('todo-updated', { todo: updatedTodo, action: 'toggled' });
        return updatedTodo;
      } catch (e) {
        await this.rollback();
        throw e;
      }
    }));
  }

  private async reorderAfterStatusChange(inTransaction = false): Promise<void> {
    const todos = (await this.db!.select('SELECT id, completed FROM todos ORDER BY completed ASC, sort_order ASC, created_at DESC')) as any[];
    const incompleteTodos = todos.filter((t) => !Boolean(t.completed));
    const completedTodos = todos.filter((t) => Boolean(t.completed));

    const exec = async () => {
      for (let i = 0; i < incompleteTodos.length; i++) {
        await this.db!.execute('UPDATE todos SET sort_order = ? WHERE id = ?', [String(i), String(incompleteTodos[i].id)]);
      }
      for (let i = 0; i < completedTodos.length; i++) {
        await this.db!.execute('UPDATE todos SET sort_order = ? WHERE id = ?', [String(incompleteTodos.length + i), String(completedTodos[i].id)]);
      }
    };

    if (inTransaction) {
      await exec();
    } else {
      await this.serialize(async () => {
        try { await this.begin(); await exec(); await this.commit(); } catch (e) { await this.rollback(); throw e; }
      });
    }
  }

  async getFirstTodo(): Promise<Todo | null> {
    this.checkInitialized();
    const result = (await this.db.select('SELECT * FROM todos ORDER BY sort_order ASC, created_at DESC LIMIT 1')) as any[];
    if (result.length > 0) {
      return { ...result[0], completed: Boolean(result[0].completed), createdAt: new Date(result[0].created_at) };
    }
    return null;
  }

  async reorderTodos(todoIds: number[]): Promise<void> {
    this.checkInitialized();
    await measure('db.reorder', async () => this.serialize(async () => {
      const todos = await this.getTodos();
      const incomplete: number[] = [];
      const completed: number[] = [];
      todoIds.forEach((id) => {
        const t = todos.find((x) => x.id === id);
        if (!t) return;
        if (t.completed) completed.push(id);
        else incomplete.push(id);
      });

      try {
        await this.begin();
        for (let i = 0; i < incomplete.length; i++) {
          await this.db!.execute('UPDATE todos SET sort_order = ? WHERE id = ?', [String(i), String(incomplete[i])]);
        }
        for (let i = 0; i < completed.length; i++) {
          await this.db!.execute('UPDATE todos SET sort_order = ? WHERE id = ?', [String(incomplete.length + i), String(completed[i])]);
        }
        await this.commit();
      } catch (e) {
        await this.rollback();
        throw e;
      }

      await emit('todos-reordered', { todoIds });
    }));
  }

  async getHistoricalDates(): Promise<string[]> {
    this.checkInitialized();
    const result = (await this.db.select(`
      SELECT DISTINCT DATE(created_at) as date
      FROM todos
      WHERE DATE(created_at) <= DATE('now', 'localtime')
      ORDER BY date DESC
    `)) as any[];
    return result.map((row: any) => row.date);
  }

  async getTodosByDate(date: string): Promise<Todo[]> {
    this.checkInitialized();
    const result = (await this.db.select('SELECT * FROM todos WHERE DATE(created_at) = ? ORDER BY completed ASC, sort_order ASC, created_at DESC', [date])) as any[];
    return result.map((todo: any) => ({
      ...todo,
      completed: Boolean(todo.completed),
      createdAt: new Date(todo.created_at),
    }));
  }

  async getFutureDates(): Promise<string[]> {
    this.checkInitialized();
    const result = (await this.db.select(`
      SELECT DISTINCT DATE(created_at) as date
      FROM todos
      WHERE DATE(created_at) > DATE('now', 'localtime')
      ORDER BY date ASC
    `)) as any[];
    return result.map((row: any) => row.date);
  }
}

// ---------------- Web (localStorage) implementation ----------------

type StoreShape = {
  seq: number;
  todos: Record<string, Todo[]>; // key: YYYY-MM-DD
};

function getTestId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('testId') || 'default';
  } catch {
    return 'default';
  }
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

class WebDatabaseService {
  private initialized = false;
  private key = `rtodo-e2e-${getTestId()}`;

  async init(): Promise<void> {
    if (!localStorage.getItem(this.key)) {
      const initial: StoreShape = { seq: 0, todos: {} };
      localStorage.setItem(this.key, JSON.stringify(initial));
    }
    this.initialized = true;
  }

  private checkInitialized(): void {
    if (!this.initialized) throw new Error('Database not initialized');
  }

  private read(): StoreShape {
    const raw = localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as StoreShape) : { seq: 0, todos: {} };
  }

  private write(data: StoreShape) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }

  private ensureDate(data: StoreShape, date: string) {
    if (!data.todos[date]) data.todos[date] = [];
  }

  private toPublic(todo: Todo): Todo {
    return { ...todo, createdAt: new Date(todo.created_at) };
  }

  async getTodos(): Promise<Todo[]> {
    this.checkInitialized();
    const data = this.read();
    const all = Object.values(data.todos).flat();
    // Order: incomplete first by sort_order, then completed by sort_order, then created_at desc when tie
    return all
      .slice()
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .map((t) => this.toPublic(t));
  }

  async addTodo(text: string, date?: string): Promise<Todo> {
    this.checkInitialized();
    const data = this.read();
    const dateKey = date ? new Date(date).toISOString().split('T')[0] : todayStr();
    this.ensureDate(data, dateKey);

    const nextId = ++data.seq;
    const nextSort = (data.todos[dateKey].filter((t) => !t.completed).reduce((m, t) => Math.max(m, t.sort_order), 0) || 0) + 1;
    const nowIso = date ? new Date(date).toISOString() : new Date().toISOString();
    const newTodo: Todo = { id: nextId, text, completed: false, created_at: nowIso, sort_order: nextSort };
    data.todos[dateKey].push(newTodo);
    this.write(data);
    await emit('todo-added', { todo: this.toPublic(newTodo) });
    return this.toPublic(newTodo);
  }

  async updateTodo(id: number, updates: Partial<Pick<Todo, 'text' | 'completed'>>): Promise<Todo> {
    this.checkInitialized();
    const data = this.read();
    for (const date of Object.keys(data.todos)) {
      const arr = data.todos[date];
      const idx = arr.findIndex((t) => t.id === id);
      if (idx >= 0) {
        const updated = { ...arr[idx], ...updates } as Todo;
        arr[idx] = updated;
        this.write(data);
        return this.toPublic(updated);
      }
    }
    throw new Error('Todo not found');
  }

  async deleteTodo(id: number): Promise<boolean> {
    this.checkInitialized();
    const data = this.read();
    for (const date of Object.keys(data.todos)) {
      const arr = data.todos[date];
      const idx = arr.findIndex((t) => t.id === id);
      if (idx >= 0) {
        arr.splice(idx, 1);
        this.write(data);
        await emit('todo-deleted', { id });
        return true;
      }
    }
    return false;
  }

  async clearCompleted(): Promise<number> {
    this.checkInitialized();
    const data = this.read();
    let removed = 0;
    for (const date of Object.keys(data.todos)) {
      const before = data.todos[date].length;
      data.todos[date] = data.todos[date].filter((t) => !t.completed);
      removed += before - data.todos[date].length;
    }
    this.write(data);
    return removed;
  }

  async toggleTodo(id: number): Promise<Todo> {
    this.checkInitialized();
    const data = this.read();
    for (const date of Object.keys(data.todos)) {
      const arr = data.todos[date];
      const idx = arr.findIndex((t) => t.id === id);
      if (idx >= 0) {
        arr[idx].completed = !arr[idx].completed;
        await this.reorderAfterStatusChange(data, date);
        const updated = this.toPublic(arr[idx]);
        this.write(data);
        await emit('todo-updated', { todo: updated, action: 'toggled' });
        return updated;
      }
    }
    throw new Error('Todo not found');
  }

  private async reorderAfterStatusChange(data: StoreShape, date: string): Promise<void> {
    const arr = data.todos[date];
    const incomplete = arr.filter((t) => !t.completed);
    const completed = arr.filter((t) => t.completed);
    incomplete.forEach((t, i) => (t.sort_order = i));
    completed.forEach((t, i) => (t.sort_order = incomplete.length + i));
  }

  async getFirstTodo(): Promise<Todo | null> {
    this.checkInitialized();
    const data = this.read();
    const all = Object.values(data.todos).flat();
    if (all.length === 0) return null;
    const sorted = all.slice().sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return this.toPublic(sorted[0]);
  }

  async reorderTodos(todoIds: number[]): Promise<void> {
    this.checkInitialized();
    const data = this.read();
    const all = Object.values(data.todos).flat();
    // Build map of id -> todo and date
    const byId = new Map<number, { t: Todo; date: string }>();
    for (const [date, arr] of Object.entries(data.todos)) {
      for (const t of arr) byId.set(t.id, { t, date });
    }

    // We only reorder within their current date buckets, preserving completion splits
    const dateBuckets: Record<string, { incomplete: number[]; completed: number[] }> = {};
    for (const id of todoIds) {
      const info = byId.get(id);
      if (!info) continue;
      const date = info.date;
      if (!dateBuckets[date]) dateBuckets[date] = { incomplete: [], completed: [] };
      if (info.t.completed) dateBuckets[date].completed.push(id);
      else dateBuckets[date].incomplete.push(id);
    }

    for (const [date, parts] of Object.entries(dateBuckets)) {
      const arr = data.todos[date];
      // Set sort order for incomplete first
      parts.incomplete.forEach((id, i) => {
        const todo = arr.find((t) => t.id === id);
        if (todo) todo.sort_order = i;
      });
      parts.completed.forEach((id, i) => {
        const todo = arr.find((t) => t.id === id);
        if (todo) todo.sort_order = parts.incomplete.length + i;
      });
      // Keep other todos at the end in stable order
      let max = parts.incomplete.length + parts.completed.length;
      arr
        .filter((t) => !parts.incomplete.includes(t.id) && !parts.completed.includes(t.id))
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((t) => (t.sort_order = max++));
    }

    this.write(data);
    await emit('todos-reordered', { todoIds });
  }

  private listDates(): string[] {
    const data = this.read();
    return Object.keys(data.todos).sort();
  }

  async getHistoricalDates(): Promise<string[]> {
    this.checkInitialized();
    const today = todayStr();
    return this.listDates().filter((d) => d <= today).sort().reverse();
  }

  async getTodosByDate(date: string): Promise<Todo[]> {
    this.checkInitialized();
    const data = this.read();
    const arr = data.todos[date] || [];
    return arr
      .slice()
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .map((t) => this.toPublic(t));
  }

  async getFutureDates(): Promise<string[]> {
    this.checkInitialized();
    const today = todayStr();
    return this.listDates().filter((d) => d > today).sort();
  }
}

export const database = isTauri() ? new TauriDatabaseService() : new WebDatabaseService();
