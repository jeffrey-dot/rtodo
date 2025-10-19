import { emit } from './events';

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
  private static readonly STEP = 1000;
  private static readonly MIN_GAP_THRESHOLD = 10;

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

      // Pragmas for reliability and concurrency
      await this.db.execute(`PRAGMA journal_mode=WAL;`);
      await this.db.execute(`PRAGMA synchronous=NORMAL;`);
      await this.db.execute(`PRAGMA foreign_keys=ON;`);
      await this.db.execute(`PRAGMA busy_timeout=5000;`);

      // Base table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          date_scope TEXT
        )
      `);

      // Backward compatibility: older DBs may miss columns
      try {
        await this.db.execute(`ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
      } catch {}
      try {
        await this.db.execute(`ALTER TABLE todos ADD COLUMN date_scope TEXT`);
      } catch {}

      // Backfill date_scope for any existing rows
      await this.db.execute(`UPDATE todos SET date_scope = DATE(created_at) WHERE date_scope IS NULL OR date_scope = ''`);

      // If sort_order was 0 from legacy, give a deterministic order per day
      // We pack per day with gaps to satisfy UNIQUE(date_scope, sort_order)
      const dates = (await this.db.select(`SELECT DISTINCT date_scope as d FROM todos WHERE date_scope IS NOT NULL AND date_scope <> ''`)) as any[];
      for (const row of dates) {
        await this.canonicalizeDateScope(row.d);
      }

      // Indexes
      await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_todos_date_sort ON todos(date_scope, sort_order)`);
      // Unique index may fail if duplicates exist; after canonicalization it should succeed
      await this.db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_date_sort_unique ON todos(date_scope, sort_order)`);

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

  private todayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async canonicalizeDateScope(dateScope: string): Promise<void> {
    // Re-pack a date_scope so that sort_order values are spaced by STEP and unique
    const rows = (await this.db.select(
      `SELECT id, completed, sort_order, created_at FROM todos WHERE date_scope = ? ORDER BY completed ASC, sort_order ASC, created_at DESC`,
      [dateScope]
    )) as any[];
    let i = 0;
    const step = TauriDatabaseService.STEP;
    const parts: string[] = [];
    const ids: number[] = [];
    for (const r of rows) {
      const newSort = ++i * step; // start from step
      parts.push(`WHEN ${Number(r.id)} THEN ${newSort}`);
      ids.push(Number(r.id));
    }
    if (ids.length === 0) return;
    const caseExpr = parts.join(' ');
    const placeholders = ids.map(() => '?').join(',');
    await this.db.execute(
      `BEGIN IMMEDIATE`,
    );
    try {
      await this.db.execute(
        `UPDATE todos SET sort_order = CASE id ${caseExpr} END WHERE date_scope = ? AND id IN (${placeholders})`,
        [dateScope, ...ids.map(String)]
      );
      await this.db.execute(`COMMIT`);
    } catch (e) {
      await this.db.execute(`ROLLBACK`);
      throw e;
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
    const nowIso = date ? new Date(date).toISOString() : new Date().toISOString();
    const dateKey = (date ? new Date(date) : new Date()).toISOString().split('T')[0];

    const maxSortResult = (await this.db.select(
      `SELECT MAX(sort_order) as max_sort FROM todos WHERE completed = 0 AND date_scope = ?`,
      [dateKey]
    )) as any[];
    const maxSort = Number(maxSortResult[0]?.max_sort || 0);
    const nextSort = (maxSort > 0 ? maxSort : 0) + TauriDatabaseService.STEP;

    const result = (await this.db.select(
      'INSERT INTO todos (text, completed, created_at, sort_order, date_scope) VALUES (?, ?, ?, ?, ?) RETURNING *',
      [text, 0, nowIso, nextSort, dateKey]
    )) as any[];

    const newTodo: Todo = {
      ...result[0],
      completed: Boolean(result[0].completed),
      createdAt: new Date(result[0].created_at),
    };

    await emit('todo-added', { todo: newTodo });
    return newTodo;
  }

  async updateTodo(id: number, updates: Partial<Pick<Todo, 'text' | 'completed'>>): Promise<Todo> {
    this.checkInitialized();
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = Object.values(updates).map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value));
    values.push(String(id));

    const result = (await this.db.select(`UPDATE todos SET ${setClause} WHERE id = ? RETURNING *`, values as any[])) as any[];
    return {
      ...result[0],
      completed: Boolean(result[0].completed),
      createdAt: new Date(result[0].created_at),
    };
  }

  async deleteTodo(id: number): Promise<boolean> {
    this.checkInitialized();
    await this.db.execute('DELETE FROM todos WHERE id = ?', [String(id)]);
    await emit('todo-deleted', { id });
    return true;
  }

  async clearCompleted(): Promise<number> {
    this.checkInitialized();
    const result = await this.db.execute('DELETE FROM todos WHERE completed = 1');
    return result.rowsAffected || 0;
  }

  async toggleTodo(id: number): Promise<Todo> {
    this.checkInitialized();
    await this.db.execute('BEGIN IMMEDIATE');
    try {
      const result = (await this.db.select('UPDATE todos SET completed = NOT completed WHERE id = ? RETURNING *', [String(id)])) as any[];
      const row = result[0];
      const updatedTodo: Todo = {
        ...row,
        completed: Boolean(row.completed),
        createdAt: new Date(row.created_at),
      };

      const dateScope = row.date_scope || new Date(row.created_at).toISOString().split('T')[0];
      // Move to the end of its new group with gaps
      const group = updatedTodo.completed ? 1 : 0;
      const maxRes = (await this.db.select(
        'SELECT MAX(sort_order) as m FROM todos WHERE date_scope = ? AND completed = ?',
        [dateScope, String(group)]
      )) as any[];
      const maxSort = Number(maxRes[0]?.m || 0);
      const nextSort = (maxSort > 0 ? maxSort : 0) + TauriDatabaseService.STEP;
      await this.db.execute('UPDATE todos SET sort_order = ? WHERE id = ?', [String(nextSort), String(id)]);

      await this.db.execute('COMMIT');
      await emit('todo-updated', { todo: updatedTodo, action: 'toggled' });
      return updatedTodo;
    } catch (e) {
      await this.db.execute('ROLLBACK');
      throw e;
    }
  }

  async getFirstTodo(): Promise<Todo | null> {
    this.checkInitialized();
    const today = this.todayKey();
    const result = (await this.db.select(
      'SELECT * FROM todos WHERE date_scope = ? AND completed = 0 ORDER BY sort_order ASC, created_at DESC LIMIT 1',
      [today]
    )) as any[];
    if (result.length > 0) {
      return { ...result[0], completed: Boolean(result[0].completed), createdAt: new Date(result[0].created_at) };
    }
    return null;
  }

  async reorderTodos(todoIds: number[]): Promise<void> {
    this.checkInitialized();
    if (todoIds.length === 0) return;

    // Fetch metadata for ids
    const placeholders = todoIds.map(() => '?').join(',');
    const rows = (await this.db.select(
      `SELECT id, completed, date_scope, sort_order, created_at FROM todos WHERE id IN (${placeholders})`,
      todoIds.map(String)
    )) as any[];
    if (rows.length === 0) return;

    // Group by date_scope (should be one in normal usage)
    const byDate: Record<string, { inc: number[]; comp: number[] }> = {};
    const statusById = new Map<number, { date: string; completed: boolean }>();
    for (const r of rows) {
      const date = r.date_scope || new Date(r.created_at).toISOString().split('T')[0];
      statusById.set(Number(r.id), { date, completed: Boolean(r.completed) });
    }
    for (const id of todoIds) {
      const meta = statusById.get(id);
      if (!meta) continue;
      if (!byDate[meta.date]) byDate[meta.date] = { inc: [], comp: [] };
      if (meta.completed) byDate[meta.date].comp.push(id);
      else byDate[meta.date].inc.push(id);
    }

    await this.db.execute('BEGIN IMMEDIATE');
    try {
      for (const [date, parts] of Object.entries(byDate)) {
        // Fetch the rest items for this date to keep stable order at the end
        const rest = (await this.db.select(
          `SELECT id, completed, sort_order, created_at FROM todos WHERE date_scope = ? ORDER BY completed ASC, sort_order ASC, created_at DESC`,
          [date]
        )) as any[];
        const restInc: number[] = [];
        const restComp: number[] = [];
        for (const r of rest) {
          const id = Number(r.id);
          if (parts.inc.includes(id) || parts.comp.includes(id)) continue;
          if (Boolean(r.completed)) restComp.push(id);
          else restInc.push(id);
        }

        const finalOrder = [...parts.inc, ...restInc, ...parts.comp, ...restComp];
        const step = TauriDatabaseService.STEP;
        let i = 0;
        const cases: string[] = [];
        for (const id of finalOrder) {
          const newSort = ++i * step;
          cases.push(`WHEN ${id} THEN ${newSort}`);
        }
        const caseExpr = cases.join(' ');
        const allIds = finalOrder;
        if (allIds.length > 0) {
          const idPlaceholders = allIds.map(() => '?').join(',');
          await this.db.execute(
            `UPDATE todos SET sort_order = CASE id ${caseExpr} END WHERE date_scope = ? AND id IN (${idPlaceholders})`,
            [date, ...allIds.map(String)]
          );
        }

        // Canonicalize if gaps are too small (optional here since we repack every time)
      }
      await this.db.execute('COMMIT');
    } catch (e) {
      await this.db.execute('ROLLBACK');
      throw e;
    }

    await emit('todos-reordered', { todoIds });
  }

  async getHistoricalDates(): Promise<string[]> {
    this.checkInitialized();
    const today = this.todayKey();
    const result = (await this.db.select(
      `SELECT DISTINCT date_scope as date FROM todos WHERE date_scope <= ? ORDER BY date DESC`,
      [today]
    )) as any[];
    return result.map((row: any) => row.date);
  }

  async getTodosByDate(date: string): Promise<Todo[]> {
    this.checkInitialized();
    const result = (await this.db.select(
      'SELECT * FROM todos WHERE date_scope = ? ORDER BY completed ASC, sort_order ASC, created_at DESC',
      [date]
    )) as any[];
    return result.map((todo: any) => ({
      ...todo,
      completed: Boolean(todo.completed),
      createdAt: new Date(todo.created_at),
    }));
  }

  async getFutureDates(): Promise<string[]> {
    this.checkInitialized();
    const today = this.todayKey();
    const result = (await this.db.select(
      `SELECT DISTINCT date_scope as date FROM todos WHERE date_scope > ? ORDER BY date ASC`,
      [today]
    )) as any[];
    return result.map((row: any) => row.date);
  }

  // Move a task to a different date scope and place at top or bottom of its completion group
  async moveToDate(taskId: number, targetDate: string, position: 'top' | 'bottom' = 'bottom'): Promise<void> {
    this.checkInitialized();
    const dateKey = new Date(targetDate).toISOString().split('T')[0];
    await this.db.execute('BEGIN IMMEDIATE');
    try {
      const rows = (await this.db.select('SELECT id, completed FROM todos WHERE id = ?', [String(taskId)])) as any[];
      if (rows.length === 0) {
        await this.db.execute('ROLLBACK');
        return;
      }
      const completed = Boolean(rows[0].completed);
      const group = completed ? 1 : 0;

      if (position === 'bottom') {
        const maxRes = (await this.db.select(
          'SELECT MAX(sort_order) as m FROM todos WHERE date_scope = ? AND completed = ?',
          [dateKey, String(group)]
        )) as any[];
        const maxSort = Number(maxRes[0]?.m || 0);
        const nextSort = (maxSort > 0 ? maxSort : 0) + TauriDatabaseService.STEP;
        await this.db.execute('UPDATE todos SET date_scope = ?, sort_order = ? WHERE id = ?', [dateKey, String(nextSort), String(taskId)]);
      } else {
        const minRes = (await this.db.select(
          'SELECT MIN(sort_order) as m FROM todos WHERE date_scope = ? AND completed = ?',
          [dateKey, String(group)]
        )) as any[];
        const minSort = Number(minRes[0]?.m || 0);
        const newSort = (minSort || TauriDatabaseService.STEP) - TauriDatabaseService.STEP; // ensure it's at top
        await this.db.execute('UPDATE todos SET date_scope = ?, sort_order = ? WHERE id = ?', [dateKey, String(newSort), String(taskId)]);
        // Optionally repack to keep numbers positive and spaced
        await this.canonicalizeDateScope(dateKey);
      }

      await this.db.execute('COMMIT');
      await emit('todos-reordered', { todoIds: [taskId] });
    } catch (e) {
      await this.db.execute('ROLLBACK');
      throw e;
    }
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

  async moveToDate(taskId: number, targetDate: string, position: 'top' | 'bottom' = 'bottom'): Promise<void> {
    this.checkInitialized();
    const data = this.read();
    const targetKey = new Date(targetDate).toISOString().split('T')[0];
    this.ensureDate(data, targetKey);

    // Find and remove task from current date
    let found: Todo | null = null;
    let fromDate: string | null = null;
    for (const [date, arr] of Object.entries(data.todos)) {
      const idx = arr.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        found = arr.splice(idx, 1)[0];
        fromDate = date;
        break;
      }
    }
    if (!found) return;

    // Insert into target date at top/bottom of its completion group
    const targetArr = data.todos[targetKey];
    const groupArr = targetArr.filter((t) => t.completed === found!.completed);
    if (position === 'bottom') {
      const maxSort = groupArr.reduce((m, t) => Math.max(m, t.sort_order), 0);
      found.sort_order = maxSort + 1;
      targetArr.push(found);
    } else {
      const minSort = groupArr.reduce((m, t) => Math.min(m, t.sort_order), Infinity);
      found.sort_order = isFinite(minSort) ? minSort - 1 : 0;
      targetArr.push(found);
      // Repack after inserting at top to keep numbers small
      const inc = targetArr.filter((t) => !t.completed).sort((a, b) => a.sort_order - b.sort_order);
      const comp = targetArr.filter((t) => t.completed).sort((a, b) => a.sort_order - b.sort_order);
      const repack = [...inc, ...comp];
      repack.forEach((t, i) => (t.sort_order = i));
    }

    this.write(data);
    await emit('todos-reordered', { todoIds: [taskId] });
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
