import { api } from "./client";
import { Attachment } from "../types";

export async function uploadAttachment(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<Attachment> {
  const formData = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape for files —
  // it isn't a real Blob, but fetch/axios on RN know how to stream it.
  formData.append("file", { uri, name: fileName, type: mimeType } as unknown as Blob);

  const { data } = await api.post<Attachment>("/attachments", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
