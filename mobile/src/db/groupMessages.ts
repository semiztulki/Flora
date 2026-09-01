import { getDb } from "./database";
import { LocalAttachment } from "./messages";

export interface LocalGroupMessage {
  localId: number;
  serverId: number | null;
  clientId: string | null;
  groupId: number;
  senderId: number;
  body: string;
  attachment: LocalAttachment | null;
  createdAt: string;
  status: "pending" | "sent";
}

interface GroupMessageRow {
  local_id: number;
  server_id: number | null;
  client_id: string | null;
  group_id: number;
  sender_id: number;
  body: string;
  attachment_id: number | null;
  attachment_content_type: string | null;
  attachment_size: number | null;
  attachment_width: number | null;
  attachment_height: number | null;
  created_at: string;
  status: "pending" | "sent";
}

function mapRow(row: GroupMessageRow): LocalGroupMessage {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    clientId: row.client_id,
    groupId: row.group_id,
    senderId: row.sender_id,
    body: row.body,
    attachment: row.attachment_id
      ? {
          id: row.attachment_id,
          contentType: row.attachment_content_type!,
          sizeBytes: row.attachment_size!,
          width: row.attachment_width,
          height: row.attachment_height,
        }
      : null,
    createdAt: row.created_at,
    status: row.status,
  };
}

export async function insertPendingGroupMessage(input: {
  clientId: string;
  groupId: number;
  senderId: number;
  body: string;
  attachment?: LocalAttachment | null;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  const attachment = input.attachment ?? null;
  await db.runAsync(
    `INSERT INTO group_messages
       (server_id, client_id, group_id, sender_id, body,
        attachment_id, attachment_content_type, attachment_size, attachment_width, attachment_height,
        created_at, status)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    input.clientId,
    input.groupId,
    input.senderId,
    input.body,
    attachment?.id ?? null,
    attachment?.contentType ?? null,
    attachment?.sizeBytes ?? null,
    attachment?.width ?? null,
    attachment?.height ?? null,
    input.createdAt
  );
}

export async function upsertConfirmedGroupMessage(msg: {
  serverId: number;
  clientId: string | null;
  groupId: number;
  senderId: number;
  body: string;
  attachment?: LocalAttachment | null;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  const attachment = msg.attachment ?? null;
  if (msg.clientId) {
    const result = await db.runAsync(
      `UPDATE group_messages
       SET server_id = ?, status = 'sent', body = ?, created_at = ?, group_id = ?, sender_id = ?,
           attachment_id = ?, attachment_content_type = ?, attachment_size = ?,
           attachment_width = ?, attachment_height = ?
       WHERE client_id = ?`,
      msg.serverId,
      msg.body,
      msg.createdAt,
      msg.groupId,
      msg.senderId,
      attachment?.id ?? null,
      attachment?.contentType ?? null,
      attachment?.sizeBytes ?? null,
      attachment?.width ?? null,
      attachment?.height ?? null,
      msg.clientId
    );
    if (result.changes > 0) return;
  }
  await db.runAsync(
    `INSERT OR IGNORE INTO group_messages
       (server_id, client_id, group_id, sender_id, body,
        attachment_id, attachment_content_type, attachment_size, attachment_width, attachment_height,
        created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
    msg.serverId,
    msg.clientId,
    msg.groupId,
    msg.senderId,
    msg.body,
    attachment?.id ?? null,
    attachment?.contentType ?? null,
    attachment?.sizeBytes ?? null,
    attachment?.width ?? null,
    attachment?.height ?? null,
    msg.createdAt
  );
}

export async function getMessagesForGroup(groupId: number): Promise<LocalGroupMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GroupMessageRow>(
    `SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC, local_id ASC`,
    groupId
  );
  return rows.map(mapRow);
}

export async function getMaxGroupServerId(groupId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ max_id: number | null }>(
    `SELECT MAX(server_id) as max_id FROM group_messages WHERE group_id = ?`,
    groupId
  );
  return row?.max_id ?? 0;
}

export async function getPendingGroupMessages(): Promise<LocalGroupMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GroupMessageRow>(
    `SELECT * FROM group_messages WHERE status = 'pending' ORDER BY local_id ASC`
  );
  return rows.map(mapRow);
}

export async function markGroupRead(groupId: number, uptoServerId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO group_read_state (group_id, last_read_server_id) VALUES (?, ?)
     ON CONFLICT(group_id) DO UPDATE SET
       last_read_server_id = MAX(last_read_server_id, excluded.last_read_server_id)`,
    groupId,
    uptoServerId
  );
}

export async function getUnreadGroupCounts(currentUserId: number): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ group_id: number; unread: number }>(
    `SELECT m.group_id as group_id, COUNT(*) as unread
     FROM group_messages m
     LEFT JOIN group_read_state r ON r.group_id = m.group_id
     WHERE m.sender_id != ?
       AND m.server_id IS NOT NULL
       AND m.server_id > COALESCE(r.last_read_server_id, 0)
     GROUP BY m.group_id`,
    currentUserId
  );
  const result: Record<number, number> = {};
  for (const row of rows) result[row.group_id] = row.unread;
  return result;
}
