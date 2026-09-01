import { api } from "./client";
import { User } from "../types";

export async function fetchContacts(): Promise<User[]> {
  const { data } = await api.get<User[]>("/contacts");
  return data;
}

export async function addContact(username: string): Promise<User> {
  const { data } = await api.post<User>("/contacts", { username });
  return data;
}
