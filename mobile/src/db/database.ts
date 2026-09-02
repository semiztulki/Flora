import * as SQLite from "expo-sqlite";

// Scoped by account so two different logins on the same device — or the
// same account after a dev backend wipe that reassigns low numeric ids —
// never see each other's cached messages. `null` (no signed-in user yet)
// falls back to a small shared placeholder file that's never really used
// for anything sensitive.
let currentUserId: number | null = null;
let currentDbName = "flora.db";
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function dbNameFor(userId: number | null): string {
  return userId ? `flora_${userId}.db` : "flora.db";
}

/** Call whenever the signed-in account changes (login, register, session
 * restore, logout with null) — opens/creates that account's own local DB
 * instead of continuing to read whatever was cached under the old scope. */
export function setDbScope(userId: number | null): void {
  const nextDbName = dbNameFor(userId);
  if (nextDbName === currentDbName) return;
  currentUserId = userId;
  currentDbName = nextDbName;
  dbPromise = null;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(currentDbName).then(async (db) => {
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

/** Wipes this account's entire local message log (both DMs and groups) from
 * this device. Used by the "clear local data" escape hatch — not something
 * a normal user flow triggers on its own. */
export async function wipeLocalDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(currentDbName);
}
