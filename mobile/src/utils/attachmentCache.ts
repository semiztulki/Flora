import * as FileSystem from "expo-file-system/legacy";

import { getToken } from "../api/storage";
import { API_URL } from "../config";

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
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
  await ensureDir();
  const localUri = `${ATTACHMENTS_DIR}${attachmentId}.${extensionFor(contentType)}`;

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
