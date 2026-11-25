import * as SQLite from 'expo-sqlite';
import { EditorSession } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export const initDatabase = async (): Promise<void> => {
  try {
    if (!db) {
      db = SQLite.openDatabaseSync('aver_studio.db');
      db.execSync(`
        CREATE TABLE IF NOT EXISTS editor_projects (
          project_id TEXT PRIMARY KEY,
          clip_id TEXT NOT NULL,
          session_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    }
  } catch (err) {
    console.warn('SQLite init error (fallback mode enabled):', err);
  }
};

export const saveProjectDraft = async (session: EditorSession): Promise<void> => {
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      const sessionJson = JSON.stringify(session);
      db.runSync(
        `INSERT OR REPLACE INTO editor_projects (project_id, clip_id, session_json, updated_at) 
         VALUES (?, ?, ?, ?);`,
        [session.projectId, session.clipId, sessionJson, Date.now()]
      );
    }
  } catch (err) {
    console.warn('Failed to save project draft to SQLite:', err);
  }
};

export const loadProjectDraft = async (projectId: string): Promise<EditorSession | null> => {
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      const result = db.getFirstSync<{ session_json: string }>(
        `SELECT session_json FROM editor_projects WHERE project_id = ?;`,
        [projectId]
      );
      if (result && result.session_json) {
        return JSON.parse(result.session_json) as EditorSession;
      }
    }
  } catch (err) {
    console.warn('Failed to load project draft from SQLite:', err);
  }
  return null;
};

export const loadLatestProjectDraft = async (clipId: string): Promise<EditorSession | null> => {
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      const result = db.getFirstSync<{ session_json: string }>(
        `SELECT session_json FROM editor_projects WHERE clip_id = ? ORDER BY updated_at DESC LIMIT 1;`,
        [clipId]
      );
      if (result && result.session_json) {
        return JSON.parse(result.session_json) as EditorSession;
      }
    }
  } catch (err) {
    console.warn('Failed to load latest draft from SQLite:', err);
  }
  return null;
};

