import * as FileSystem from "expo-file-system/legacy";

import { getToken } from "../api/storage";
import { API_URL } from "../config";

// Scoped by account, same reasoning as db/database.ts's setDbScope: attachment
// ids are shared/global across all users on the backend, so a flat cache dir
// keyed only by id would let a second account on this device (or the same
// account after a dev backend wipe reassigns low ids) get served someone
// else's already-downloaded file for a colliding id.
let currentUserId: number | null = null;

export function setAttachmentCacheScope(userId: number | null): void {
  currentUserId = userId;
}

function attachmentsDir(): string {
  const suffix = currentUserId ? `_${currentUserId}` : "";
  return `${FileSystem.documentDirectory}attachments${suffix}/`;
}

async function ensureDir(): Promise<string> {
  const dir = attachmentsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/** Downloads an attachment once and caches it on device — same offline-first
 * idea as the local message log: once you've seen an image, it's yours to
 * view without a network round-trip. */
export async function getLocalAttachmentUri(
  attachmentId: number,
  contentType: string
): Promise<string> {
  const dir = await ensureDir();
  const localUri = `${dir}${attachmentId}.${extensionFor(contentType)}`;

  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists) return localUri;

  const token = await getToken();
  const result = await FileSystem.downloadAsync(
    `${API_URL}/attachments/${attachmentId}/file`,
    localUri,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  );
  return result.uri;
}

/** Deletes this account's whole cached-attachment directory on this device.
 * Used by the "clear local data" escape hatch. */
export async function clearAttachmentCache(): Promise<void> {
  const dir = attachmentsDir();
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
