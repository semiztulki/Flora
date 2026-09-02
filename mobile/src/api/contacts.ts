import { api } from "./client";
import { BlockedUser, ContactAddResult, ContactRequest, User } from "../types";

export async function fetchContacts(): Promise<User[]> {
  const { data } = await api.get<User[]>("/contacts");
  return data;
}

export async function addContact(uin: number): Promise<ContactAddResult> {
  const { data } = await api.post<ContactAddResult>("/contacts", { uin });
  return data;
}

export async function fetchIncomingRequests(): Promise<ContactRequest[]> {
  const { data } = await api.get<ContactRequest[]>("/contacts/requests");
  return data;
}

export async function acceptRequest(requesterId: number): Promise<User> {
  const { data } = await api.post<User>(`/contacts/requests/${requesterId}/accept`);
  return data;
}

export async function declineRequest(requesterId: number): Promise<void> {
  await api.post(`/contacts/requests/${requesterId}/decline`);
}

export async function blockUser(uin: number): Promise<BlockedUser> {
  const { data } = await api.post<BlockedUser>("/contacts/block", { uin });
  return data;
}

export async function unblockUser(uin: number): Promise<void> {
  await api.post("/contacts/unblock", { uin });
}

export async function fetchBlocked(): Promise<BlockedUser[]> {
  const { data } = await api.get<BlockedUser[]>("/contacts/blocked");
  return data;
}

/** Grants/revokes one contact's ability to see your real status while
 * you're invisible, instead of just seeing "offline" like everyone else. */
export async function removeContact(contactId: number): Promise<void> {
  await api.delete(`/contacts/${contactId}`);
}

export async function setVisibleWhenInvisible(
  contactId: number,
  visible: boolean
): Promise<User> {
  const { data } = await api.patch<User>(`/contacts/${contactId}/visibility`, {
    visible_when_invisible: visible,
  });
  return data;
}

/** Your own private label for this contact ("Лена — реставратор") — never
 * visible to them or anyone else. Pass null to clear it. */
export async function setLocalNickname(
  contactId: number,
  nickname: string | null
): Promise<User> {
  const { data } = await api.patch<User>(`/contacts/${contactId}/nickname`, {
    local_nickname: nickname,
  });
  return data;
}
