import Database from '@tauri-apps/plugin-sql';
import { appDataDir } from '@tauri-apps/api/path';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_at: string;
  createdAt?: Date;
}

class DatabaseService {
  private db: Database | null = null;
  private readonly DB_FILE = 'rtodo.db';

  async init(): Promise<void> {
    try {
      const dataDir = await appDataDir();
      const dbPath = `sqlite:${dataDir}${this.DB_FILE}`;

      this.db = await Database.load(dbPath);

      // Create todos table if it doesn't exist
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);

      console.log('Database initialized successfully at:', dbPath);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async getTodos(): Promise<Todo[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.select('SELECT * FROM todos ORDER BY created_at DESC');
      return result.map((todo: any) => ({
        ...todo,
        createdAt: new Date(todo.created_at)
      }));
    } catch (error) {
      console.error('Failed to get todos:', error);
      throw error;
    }
  }

  async addTodo(text: string): Promise<Todo> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const result = await this.db.select(
        'INSERT INTO todos (text, completed, created_at) VALUES (?, ?, ?) RETURNING *',
        [text, false, now]
      );

      return {
        ...result[0],
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to add todo:', error);
      throw error;
    }
  }

  async updateTodo(id: number, updates: Partial<Pick<Todo, 'text' | 'completed'>>): Promise<Todo> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const setClause = Object.keys(updates).map((key, index) => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(id);

      const result = await this.db.select(
        `UPDATE todos SET ${setClause} WHERE id = ? RETURNING *`,
        values
      );

      return {
        ...result[0],
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to update todo:', error);
      throw error;
    }
  }

  async deleteTodo(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execute('DELETE FROM todos WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Failed to delete todo:', error);
      throw error;
    }
  }

  async clearCompleted(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.execute('DELETE FROM todos WHERE completed = 1');
      return result.rowsAffected || 0;
    } catch (error) {
      console.error('Failed to clear completed todos:', error);
      throw error;
    }
  }

  async toggleTodo(id: number): Promise<Todo> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.select(
        'UPDATE todos SET completed = NOT completed WHERE id = ? RETURNING *',
        [id]
      );

      return {
        ...result[0],
        createdAt: new Date(result[0].created_at)
      };
    } catch (error) {
      console.error('Failed to toggle todo:', error);
      throw error;
    }
  }

  async getFirstTodo(): Promise<Todo | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.select('SELECT * FROM todos ORDER BY created_at DESC LIMIT 1');
      if (result.length > 0) {
        return {
          ...result[0],
          createdAt: new Date(result[0].created_at)
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get first todo:', error);
      throw error;
    }
  }
}

export const database = new DatabaseService();