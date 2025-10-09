import Database from '@tauri-apps/plugin-sql';
import { appDataDir } from '@tauri-apps/api/path';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_at: string;
  sort_order: number;
  createdAt?: Date;
}

class DatabaseService {
  private db: Database | null = null;
  private readonly DB_FILE = 'com.ljw.rtodo.db';
  private initialized = false;

  async init(): Promise<void> {
    try {
      const dataDir = await appDataDir();
      console.log('Data directory:', dataDir);

      // Create rtodo directory path with proper separators
      // SQLite will automatically create the database file if the directory exists
      // We need to ensure the path uses forward slashes for cross-platform compatibility
      const rtodoDirPath = dataDir.replace(/\\/g, '/') + 'rtodo/';
      const dbPath = `sqlite:${rtodoDirPath}${this.DB_FILE}`;
      console.log('Database path:', dbPath);

      // Try to load the database - if directory doesn't exist, it will fail
      // but we can handle this gracefully
      try {
        this.db = await Database.load(dbPath);
        console.log('Database loaded successfully');
      } catch (loadError) {
        console.error('Failed to load database:', loadError);
        // Try alternative approach - use app data directory directly
        const fallbackPath = `sqlite:${dataDir.replace(/\\/g, '/')}${this.DB_FILE}`;
        console.log('Trying fallback path:', fallbackPath);
        this.db = await Database.load(fallbackPath);
        console.log('Database loaded with fallback path');
      }

      // Create todos table if it doesn't exist
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        )
      `);

      // Add sort_order column if it doesn't exist (for existing databases)
      try {
        await this.db.execute(`
          ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
        `);
      } catch (error) {
        // Column already exists, ignore error
      }

      // Initialize sort_order for existing records if needed
      await this.db.execute(`
        UPDATE todos SET sort_order = id WHERE sort_order = 0
      `);

      this.initialized = true;
      console.log('Database initialized successfully');
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

    try {
      const result = await this.db.select('SELECT * FROM todos ORDER BY completed ASC, sort_order ASC, created_at DESC');
      return result.map((todo: any) => ({
        ...todo,
        completed: Boolean(todo.completed), // Convert 0/1 to boolean
        createdAt: new Date(todo.created_at)
      }));
    } catch (error) {
      console.error('Failed to get todos:', error);
      throw error;
    }
  }

  async addTodo(text: string): Promise<Todo> {
    this.checkInitialized();

    try {
      const now = new Date().toISOString();
      // Get the highest sort_order for incomplete todos
      const maxSortResult = await this.db.select('SELECT MAX(sort_order) as max_sort FROM todos WHERE completed = 0');
      const nextSort = (maxSortResult[0]?.max_sort || 0) + 1;

      const result = await this.db.select(
        'INSERT INTO todos (text, completed, created_at, sort_order) VALUES (?, ?, ?, ?) RETURNING *',
        [text, 0, now, nextSort] // Use 0 instead of false for SQLite
      );

      return {
        ...result[0],
        completed: Boolean(result[0].completed), // Convert 0/1 to boolean
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to add todo:', error);
      throw error;
    }
  }

  async updateTodo(id: number, updates: Partial<Pick<Todo, 'text' | 'completed'>>): Promise<Todo> {
    this.checkInitialized();

    try {
      const setClause = Object.keys(updates).map((key, index) => `${key} = ?`).join(', ');
      // Convert boolean values to 0/1 for SQLite
      const values = Object.values(updates).map(value =>
        typeof value === 'boolean' ? (value ? 1 : 0) : value
      );
      values.push(id);

      const result = await this.db.select(
        `UPDATE todos SET ${setClause} WHERE id = ? RETURNING *`,
        values
      );

      return {
        ...result[0],
        completed: Boolean(result[0].completed), // Convert 0/1 to boolean
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to update todo:', error);
      throw error;
    }
  }

  async deleteTodo(id: number): Promise<boolean> {
    this.checkInitialized();

    try {
      await this.db.execute('DELETE FROM todos WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Failed to delete todo:', error);
      throw error;
    }
  }

  async clearCompleted(): Promise<number> {
    this.checkInitialized();

    try {
      const result = await this.db.execute('DELETE FROM todos WHERE completed = 1');
      return result.rowsAffected || 0;
    } catch (error) {
      console.error('Failed to clear completed todos:', error);
      throw error;
    }
  }

  async toggleTodo(id: number): Promise<Todo> {
    this.checkInitialized();

    try {
      const result = await this.db.select(
        'UPDATE todos SET completed = NOT completed WHERE id = ? RETURNING *',
        [id]
      );

      return {
        ...result[0],
        completed: Boolean(result[0].completed), // Convert 0/1 to boolean
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to toggle todo:', error);
      throw error;
    }
  }

  async getFirstTodo(): Promise<Todo | null> {
    this.checkInitialized();

    try {
      const result = await this.db.select('SELECT * FROM todos ORDER BY sort_order ASC, created_at DESC LIMIT 1');
      if (result.length > 0) {
        return {
          ...result[0],
          completed: Boolean(result[0].completed), // Convert 0/1 to boolean
          createdAt: new Date(result[0].created_at)
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get first todo:', error);
      throw error;
    }
  }

  async reorderTodos(todoIds: number[]): Promise<void> {
    this.checkInitialized();

    try {
      // Update sort_order for each todo
      for (let i = 0; i < todoIds.length; i++) {
        await this.db.execute(
          'UPDATE todos SET sort_order = ? WHERE id = ?',
          [i, todoIds[i]]
        );
      }
    } catch (error) {
      console.error('Failed to reorder todos:', error);
      throw error;
    }
  }

  async getHistoricalDates(): Promise<string[]> {
    this.checkInitialized();

    try {
      const result = await this.db.select(`
        SELECT DISTINCT DATE(created_at) as date
        FROM todos
        WHERE DATE(created_at) < DATE('now', 'localtime')
        ORDER BY date DESC
      `);
      return result.map((row: any) => row.date);
    } catch (error) {
      console.error('Failed to get historical dates:', error);
      throw error;
    }
  }

  async getTodosByDate(date: string): Promise<Todo[]> {
    this.checkInitialized();

    try {
      const result = await this.db.select(
        'SELECT * FROM todos WHERE DATE(created_at) = ? ORDER BY sort_order ASC, created_at DESC',
        [date]
      );
      return result.map((todo: any) => ({
        ...todo,
        completed: Boolean(todo.completed),
        createdAt: new Date(todo.created_at)
      }));
    } catch (error) {
      console.error('Failed to get todos by date:', error);
      throw error;
    }
  }
}

export const database = new DatabaseService();