import { getDb } from "./database";

export interface LocalMessage {
  localId: number;
  serverId: number | null;
  clientId: string | null;
  senderId: number;
  recipientId: number;
  peerId: number;
  body: string;
  createdAt: string;
  status: "pending" | "sent";
}

interface MessageRow {
  local_id: number;
  server_id: number | null;
  client_id: string | null;
  sender_id: number;
  recipient_id: number;
  peer_id: number;
  body: string;
  created_at: string;
  status: "pending" | "sent";
}

function mapRow(row: MessageRow): LocalMessage {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    clientId: row.client_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    peerId: row.peer_id,
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
  };
}

export async function insertPendingMessage(input: {
  clientId: string;
  senderId: number;
  recipientId: number;
  peerId: number;
  body: string;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO messages (server_id, client_id, sender_id, recipient_id, peer_id, body, created_at, status)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, 'pending')`,
    input.clientId,
    input.senderId,
    input.recipientId,
    input.peerId,
    input.body,
    input.createdAt
  );
}

/** Confirms a pending message (matched by client_id) as sent, or inserts a
 * message that originated elsewhere (an incoming message, or a delta-sync row). */
export async function upsertConfirmedMessage(msg: {
  serverId: number;
  clientId: string | null;
  senderId: number;
  recipientId: number;
  peerId: number;
  body: string;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  if (msg.clientId) {
    const result = await db.runAsync(
      `UPDATE messages
       SET server_id = ?, status = 'sent', body = ?, created_at = ?,
           sender_id = ?, recipient_id = ?, peer_id = ?
       WHERE client_id = ?`,
      msg.serverId,
      msg.body,
      msg.createdAt,
      msg.senderId,
      msg.recipientId,
      msg.peerId,
      msg.clientId
    );
    if (result.changes > 0) return;
  }
  await db.runAsync(
    `INSERT OR IGNORE INTO messages
       (server_id, client_id, sender_id, recipient_id, peer_id, body, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')`,
    msg.serverId,
    msg.clientId,
    msg.senderId,
    msg.recipientId,
    msg.peerId,
    msg.body,
    msg.createdAt
  );
}

export async function getMessagesForPeer(peerId: number): Promise<LocalMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE peer_id = ? ORDER BY created_at ASC, local_id ASC`,
    peerId
  );
  return rows.map(mapRow);
}

export async function getMaxServerId(peerId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ max_id: number | null }>(
    `SELECT MAX(server_id) as max_id FROM messages WHERE peer_id = ?`,
    peerId
  );
  return row?.max_id ?? 0;
}

export async function getPendingMessages(): Promise<LocalMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE status = 'pending' ORDER BY local_id ASC`
  );
  return rows.map(mapRow);
}

export async function markRead(peerId: number, uptoServerId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO read_state (peer_id, last_read_server_id) VALUES (?, ?)
     ON CONFLICT(peer_id) DO UPDATE SET
       last_read_server_id = MAX(last_read_server_id, excluded.last_read_server_id)`,
    peerId,
    uptoServerId
  );
}

export async function getUnreadCounts(): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ peer_id: number; unread: number }>(
    `SELECT m.peer_id as peer_id, COUNT(*) as unread
     FROM messages m
     LEFT JOIN read_state r ON r.peer_id = m.peer_id
     WHERE m.sender_id = m.peer_id
       AND m.server_id IS NOT NULL
       AND m.server_id > COALESCE(r.last_read_server_id, 0)
     GROUP BY m.peer_id`
  );
  const result: Record<number, number> = {};
  for (const row of rows) result[row.peer_id] = row.unread;
  return result;
}
