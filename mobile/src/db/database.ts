import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("flora.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS messages (
          local_id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          client_id TEXT UNIQUE,
          sender_id INTEGER NOT NULL,
          recipient_id INTEGER NOT NULL,
          peer_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'sent'
        );
        CREATE INDEX IF NOT EXISTS idx_messages_peer ON messages(peer_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_server_id
          ON messages(server_id) WHERE server_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS read_state (
          peer_id INTEGER PRIMARY KEY,
          last_read_server_id INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS group_messages (
          local_id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          client_id TEXT UNIQUE,
          group_id INTEGER NOT NULL,
          sender_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'sent'
        );
        CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_group_messages_server_id
          ON group_messages(server_id) WHERE server_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS group_read_state (
          group_id INTEGER PRIMARY KEY,
          last_read_server_id INTEGER NOT NULL DEFAULT 0
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
