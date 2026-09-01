import { api } from "./client";
import { Message } from "../types";

export async function fetchHistory(contactId: number): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/messages/${contactId}`);
  return data;
}
