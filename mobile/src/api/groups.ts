import { api } from "./client";
import { Group, GroupMessage } from "../types";

export async function fetchGroups(): Promise<Group[]> {
  const { data } = await api.get<Group[]>("/groups");
  return data;
}

export async function createGroup(name: string, memberUsernames: string[]): Promise<Group> {
  const { data } = await api.post<Group>("/groups", {
    name,
    member_usernames: memberUsernames,
  });
  return data;
}

export async function addGroupMember(groupId: number, username: string): Promise<Group> {
  const { data } = await api.post<Group>(`/groups/${groupId}/members`, { username });
  return data;
}

export async function fetchGroupHistory(groupId: number, sinceId = 0): Promise<GroupMessage[]> {
  const { data } = await api.get<GroupMessage[]>(`/groups/${groupId}/messages`, {
    params: sinceId ? { since_id: sinceId } : undefined,
  });
  return data;
}
