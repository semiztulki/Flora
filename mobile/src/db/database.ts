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
          attachment_id INTEGER,
          attachment_content_type TEXT,
          attachment_size INTEGER,
          attachment_width INTEGER,
          attachment_height INTEGER,
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

        -- Tracks the highest server message id ever synced per peer,
        -- independent of what's still stored in the messages table — so
        -- "clear conversation" (which deletes local rows) doesn't make
        -- delta-sync forget where it was and re-download the cleared history.
        CREATE TABLE IF NOT EXISTS sync_state (
          peer_id INTEGER PRIMARY KEY,
          max_synced_id INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS group_messages (
          local_id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          client_id TEXT UNIQUE,
          group_id INTEGER NOT NULL,
          sender_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          attachment_id INTEGER,
          attachment_content_type TEXT,
          attachment_size INTEGER,
          attachment_width INTEGER,
          attachment_height INTEGER,
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
