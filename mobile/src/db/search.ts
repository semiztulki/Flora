import { getDb } from "./database";

export interface SearchResult {
  kind: "dm" | "group";
  chatId: number; // peer_id for DMs, group_id for groups — the id to navigate with
  senderId: number;
  body: string;
  createdAt: string;
}

interface DmRow {
  peer_id: number;
  sender_id: number;
  body: string;
  created_at: string;
}

interface GroupRow {
  group_id: number;
  sender_id: number;
  body: string;
  created_at: string;
}

// Bounded so a very long-lived install doesn't have to scan its entire log on
// every keystroke; searches the most recent slice of history instead.
const SCAN_LIMIT = 5000;

/** Filters in JS rather than SQL LIKE, because SQLite's LIKE only case-folds
 * ASCII — a search for "привет" wouldn't match "Привет" otherwise. Local
 * history is small enough (a personal messenger, not a firehose) that
 * scanning it in JS is still instant. */
export async function searchMessages(query: string, limit = 100): Promise<SearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const db = await getDb();
  const dmRows = await db.getAllAsync<DmRow>(
    `SELECT peer_id, sender_id, body, created_at FROM messages
     WHERE body != '' ORDER BY created_at DESC LIMIT ?`,
    SCAN_LIMIT
  );
  const groupRows = await db.getAllAsync<GroupRow>(
    `SELECT group_id, sender_id, body, created_at FROM group_messages
     WHERE body != '' ORDER BY created_at DESC LIMIT ?`,
    SCAN_LIMIT
  );

  const results: SearchResult[] = [
    ...dmRows
      .filter((r) => r.body.toLowerCase().includes(needle))
      .map((r): SearchResult => ({
        kind: "dm",
        chatId: r.peer_id,
        senderId: r.sender_id,
        body: r.body,
        createdAt: r.created_at,
      })),
    ...groupRows
      .filter((r) => r.body.toLowerCase().includes(needle))
      .map((r): SearchResult => ({
        kind: "group",
        chatId: r.group_id,
        senderId: r.sender_id,
        body: r.body,
        createdAt: r.created_at,
      })),
  ];

  results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return results.slice(0, limit);
}
