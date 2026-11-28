import * as SQLite from 'expo-sqlite';
import { EditorSession, ExportedVideoRecord } from '../types';

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
        CREATE TABLE IF NOT EXISTS exported_videos (
          id TEXT PRIMARY KEY,
          clip_id TEXT NOT NULL,
          hook_title TEXT NOT NULL,
          local_uri TEXT NOT NULL,
          duration_seconds REAL NOT NULL,
          created_at INTEGER NOT NULL,
          social_caption TEXT,
          social_hashtags TEXT
        );
      `);
      // Safe migration for existing databases created before social_caption/social_hashtags
      try {
        db.execSync(`ALTER TABLE exported_videos ADD COLUMN social_caption TEXT;`);
      } catch {}
      try {
        db.execSync(`ALTER TABLE exported_videos ADD COLUMN social_hashtags TEXT;`);
      } catch {}
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

export const saveExportedVideo = async (record: ExportedVideoRecord): Promise<string[]> => {
  const replacedUris: string[] = [];
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      const prevRows = db.getAllSync<{ local_uri: string }>(
        `SELECT local_uri FROM exported_videos WHERE clip_id = ? AND local_uri != ?;`,
        [record.clip_id, record.local_uri]
      );
      for (const r of prevRows) {
        if (r.local_uri) replacedUris.push(r.local_uri);
      }
      db.runSync(`DELETE FROM exported_videos WHERE clip_id = ?;`, [record.clip_id]);
      db.runSync(
        `INSERT OR REPLACE INTO exported_videos (id, clip_id, hook_title, local_uri, duration_seconds, created_at, social_caption, social_hashtags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          record.id,
          record.clip_id,
          record.hook_title,
          record.local_uri,
          record.duration_seconds,
          record.created_at,
          record.social_caption || '',
          record.social_hashtags || '',
        ]
      );
    }
  } catch (err) {
    console.warn('Failed to save exported video to SQLite:', err);
  }
  return replacedUris;
};

export const listExportedVideos = async (): Promise<ExportedVideoRecord[]> => {
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      return db.getAllSync<ExportedVideoRecord>(
        `SELECT id, clip_id, hook_title, local_uri, duration_seconds, created_at, social_caption, social_hashtags FROM exported_videos ORDER BY created_at DESC LIMIT 30;`
      );
    }
  } catch (err) {
    console.warn('Failed to list exported videos from SQLite:', err);
  }
  return [];
};

export const deleteExportedVideo = async (id: string): Promise<void> => {
  try {
    if (!db) {
      await initDatabase();
    }
    if (db) {
      db.runSync(`DELETE FROM exported_videos WHERE id = ?;`, [id]);
    }
  } catch (err) {
    console.warn('Failed to delete exported video from SQLite:', err);
  }
};

