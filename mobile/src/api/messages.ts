import { api } from "./client";
import { Message } from "../types";

export async function fetchHistory(contactId: number, sinceId = 0): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/messages/${contactId}`, {
    params: sinceId ? { since_id: sinceId } : undefined,
  });
  return data;
}
